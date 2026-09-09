import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, require_role, verify_token
from app.db import get_session
from app.errors import not_found
from app.models.enums import CategorySource
from app.models.document import Document
from app.models.transaction import Transaction
from app.schemas.common import Page
from app.schemas.transaction import TransactionDetail, TransactionPatch, TransactionSummary
from app.services.audit import write_audit_event

router = APIRouter(tags=["transactions"])

# Flags a reviewer may set to override a transaction's category.
_CATEGORY_L1_ALLOWED = {
    "revenue", "cogs", "opex", "tax", "financing_in",
    "financing_out", "owner", "internal", "unknown",
}


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
    claims: Claims = Depends(require_role("reviewer", "admin")),
    session: AsyncSession = Depends(get_session),
) -> TransactionDetail:
    """Reviewer only. Sets category_source='human' (highest precedence, specs/04-categorise.md)."""
    transaction = await session.scalar(
        select(Transaction)
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.id == transaction_id, Document.deleted_at.is_(None))
    )
    if transaction is None:
        raise not_found("TRANSACTION_NOT_FOUND", "No transaction with that id.")
    require_business_access(transaction.business_id, claims)

    updates = body.model_dump(exclude_unset=True)
    if "category_l1" in updates and updates["category_l1"] is not None:
        if updates["category_l1"] not in _CATEGORY_L1_ALLOWED:
            raise not_found("INVALID_CATEGORY", f"category_l1 must be one of: {', '.join(sorted(_CATEGORY_L1_ALLOWED))}")
    if "category_l1" in updates or "category_l2" in updates:
        if updates.get("category_l1") is not None:
            updates["category_source"] = CategorySource.HUMAN.value
            updates["category_confidence"] = 1.0

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
    await session.refresh(transaction)
    return TransactionDetail.model_validate(transaction)


def _transaction_before(transaction: Transaction) -> dict:
    return {
        "category_l1": transaction.category_l1,
        "category_l2": transaction.category_l2,
        "category_source": transaction.category_source.value if transaction.category_source else None,
        "flags": transaction.flags,
    }
