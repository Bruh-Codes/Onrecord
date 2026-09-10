import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.db import get_session
from app.errors import forbidden, not_found
from app.models.enums import CategorySource, Role
from app.models.document import Document
from app.models.transaction import Transaction
from app.schemas.common import Page
from app.schemas.transaction import TransactionDetail, TransactionPatch, TransactionReviewItem, TransactionSummary
from app.services.audit import write_audit_event

router = APIRouter(tags=["transactions"])

# Flags a reviewer may set to override a transaction's category.
_CATEGORY_L1_ALLOWED = {
    "revenue", "cogs", "opex", "tax", "financing_in",
    "financing_out", "owner", "internal", "unknown",
}


@router.get("/v1/businesses/{business_id}/transaction-review-queue", response_model=list[TransactionReviewItem])
async def transaction_review_queue(
    business_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=200),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> list[TransactionReviewItem]:
    """Return active transactions which still need a category decision.

    The queue is deliberately transaction-level, but sorted by amount so a
    reviewer resolves the largest impact first. The document join keeps the
    source visible without ever exposing soft-deleted statement rows.
    """
    rows = (await session.execute(
        select(Transaction, Document)
        .join(Document, Transaction.document_id == Document.id)
        .where(
            Transaction.business_id == business_id,
            Document.deleted_at.is_(None),
            or_(Transaction.category_l1.is_(None), Transaction.category_l1 == "unknown"),
            func.coalesce(Transaction.flags["classification_reviewed"].as_boolean(), False).is_(False),
        )
        .order_by(Transaction.amount_pesewas.desc(), Transaction.occurred_on.desc())
        .limit(limit)
    )).all()
    return [
        TransactionReviewItem(
            id=transaction.id,
            occurred_on=transaction.occurred_on,
            direction=transaction.direction,
            amount_pesewas=transaction.amount_pesewas,
            fee_pesewas=transaction.fee_pesewas,
            levy_pesewas=transaction.levy_pesewas,
            balance_after_pesewas=transaction.balance_after_pesewas,
            counterparty_raw=transaction.counterparty_raw,
            category_l1=transaction.category_l1,
            category_l2=transaction.category_l2,
            category_source=transaction.category_source,
            category_confidence=transaction.category_confidence,
            flags=transaction.flags or {},
            account_id=transaction.account_id,
            document_id=transaction.document_id,
            document_filename=document.filename,
            document_type=document.doc_type.value if document.doc_type else None,
            provider_reference=transaction.provider_reference,
            provenance=transaction.provenance,
            ai_suggestion=(transaction.flags or {}).get("ai_category_suggestion"),
        )
        for transaction, document in rows
    ]


@router.get("/v1/businesses/{business_id}/transactions", response_model=Page[TransactionSummary])
async def list_transactions(
    business_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    from_date: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    category_l1: str | None = Query(None),
    flag: str | None = Query(None),
    account_id: uuid.UUID | None = Query(None),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Page[TransactionSummary]:
    cond = [Transaction.business_id == business_id]
    if from_date is not None:
        cond.append(Transaction.occurred_on >= from_date)
    if to is not None:
        cond.append(Transaction.occurred_on <= to)
    if category_l1 is not None:
        cond.append(Transaction.category_l1 == category_l1)
    if flag is not None:
        cond.append(Transaction.flags[flag].as_boolean().is_(True))
    if account_id is not None:
        cond.append(Transaction.account_id == account_id)

    base_query = select(Transaction).join(Document, Transaction.document_id == Document.id).where(
        *cond, Document.deleted_at.is_(None)
    )
    total = await session.scalar(select(func.count()).select_from(base_query.subquery()))
    rows = await session.scalars(
        base_query.order_by(Transaction.occurred_on.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = [TransactionSummary.model_validate(row) for row in rows]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/v1/transactions/{transaction_id}", response_model=TransactionDetail)
async def get_transaction(
    transaction_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> TransactionDetail:
    transaction = await session.scalar(
        select(Transaction)
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.id == transaction_id, Document.deleted_at.is_(None))
    )
    if transaction is None:
        raise not_found("TRANSACTION_NOT_FOUND", "No transaction with that id.")
    require_business_access(transaction.business_id, claims)
    return TransactionDetail.model_validate(transaction)


@router.patch("/v1/transactions/{transaction_id}", response_model=TransactionDetail)
async def patch_transaction(
    transaction_id: uuid.UUID,
    body: TransactionPatch,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> TransactionDetail:
    """Save a classification decision and refresh derived business insights.

    Owners may classify their own business; reviewers and admins may classify
    businesses they can access. Human decisions always take precedence over
    rules and model suggestions.
    """
    transaction = await session.scalar(
        select(Transaction)
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.id == transaction_id, Document.deleted_at.is_(None))
    )
    if transaction is None:
        raise not_found("TRANSACTION_NOT_FOUND", "No transaction with that id.")
    require_business_access(transaction.business_id, claims)
    if claims.role not in {Role.OWNER, Role.REVIEWER, Role.ADMIN}:
        raise forbidden("Only an owner, reviewer, or admin can classify transactions.")

    updates = body.model_dump(exclude_unset=True)
    if "category_l1" in updates and updates["category_l1"] is not None:
        if updates["category_l1"] not in _CATEGORY_L1_ALLOWED:
            raise not_found("INVALID_CATEGORY", f"category_l1 must be one of: {', '.join(sorted(_CATEGORY_L1_ALLOWED))}")
    if "category_l1" in updates or "category_l2" in updates:
        if updates.get("category_l1") is not None:
            updates["category_source"] = CategorySource.HUMAN.value
            updates["category_confidence"] = 1.0

    if "flags" in updates:
        # Patch flags rather than replacing them: provenance and model
        # suggestions remain available for audit after a human decision.
        updates["flags"] = {**(transaction.flags or {}), **(updates["flags"] or {})}
    if updates.get("category_l1") is not None:
        updates["flags"] = {
            **(transaction.flags or {}),
            **(updates.get("flags") or {}),
            "classification_reviewed": True,
        }

    before = _transaction_before(transaction)
    for field, value in updates.items():
        setattr(transaction, field, value)
    await write_audit_event(
        session,
        business_id=transaction.business_id,
        actor=claims.user_id,
        action="transaction.patch",
        target=f"transaction:{transaction.id}",
        before=before,
        after=updates,
    )
    await session.commit()
    from app.workers.tasks import recompute

    recompute.delay(str(transaction.business_id))
    await session.refresh(transaction)
    return TransactionDetail.model_validate(transaction)


def _transaction_before(transaction: Transaction) -> dict:
    return {
        "category_l1": transaction.category_l1,
        "category_l2": transaction.category_l2,
        "category_source": transaction.category_source.value if transaction.category_source else None,
        "flags": transaction.flags,
    }
