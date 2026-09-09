import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.db import get_session
from app.errors import not_found
from app.models.document import Document
from app.models.enums import CounterpartyKind, Direction
from app.models.transaction import Counterparty, Transaction
from app.schemas.common import Page
from app.schemas.counterparty import CounterpartyDetail

router = APIRouter(prefix="/v1/businesses/{business_id}/counterparties", tags=["counterparties"])

_KIND_ALLOWED = {k.value for k in CounterpartyKind}


@router.get("", response_model=Page[CounterpartyDetail])
async def list_counterparties(
    business_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    kind: CounterpartyKind | None = Query(None),
    search: str | None = Query(None),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Page[CounterpartyDetail]:
    active_totals = (
        select(
            Transaction.counterparty_id.label("counterparty_id"),
            func.count(Transaction.id).label("txn_count"),
            func.coalesce(func.sum(case((Transaction.direction == Direction.IN, Transaction.amount_pesewas), else_=0)), 0).label("total_in_pesewas"),
            func.coalesce(func.sum(case((Transaction.direction == Direction.OUT, Transaction.amount_pesewas), else_=0)), 0).label("total_out_pesewas"),
        )
        .join(Document, Transaction.document_id == Document.id)
        .where(
            Transaction.business_id == business_id,
            Transaction.counterparty_id.is_not(None),
            Document.deleted_at.is_(None),
        )
        .group_by(Transaction.counterparty_id)
        .subquery()
    )
    cond = [Counterparty.business_id == business_id]
    if kind is not None:
        cond.append(Counterparty.kind == kind)
    if search:
        cond.append(Counterparty.canonical_name.ilike(f"%{search.strip().upper()}%"))

    base_query = (
        select(Counterparty, active_totals.c.txn_count, active_totals.c.total_in_pesewas, active_totals.c.total_out_pesewas)
        .join(active_totals, active_totals.c.counterparty_id == Counterparty.id)
        .where(*cond)
    )
    total = await session.scalar(select(func.count()).select_from(base_query.subquery()))
    rows = await session.execute(
        base_query.order_by(active_totals.c.total_in_pesewas.desc())
        .order_by(active_totals.c.total_out_pesewas.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        CounterpartyDetail.model_validate({
            **CounterpartyDetail.model_validate(row[0]).model_dump(),
            "txn_count": row.txn_count,
            "total_in_pesewas": row.total_in_pesewas,
            "total_out_pesewas": row.total_out_pesewas,
        })
        for row in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/{counterparty_id}", response_model=CounterpartyDetail)
async def get_counterparty(
    business_id: uuid.UUID,
    counterparty_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> CounterpartyDetail:
    counterparty = await session.scalar(
        select(Counterparty)
        .join(Transaction, Transaction.counterparty_id == Counterparty.id)
        .join(Document, Transaction.document_id == Document.id)
        .where(
            Counterparty.id == counterparty_id,
            Counterparty.business_id == business_id,
            Document.deleted_at.is_(None),
        )
    )
    if counterparty is None:
        raise not_found("COUNTERPARTY_NOT_FOUND", "No counterparty with that id.")
    return CounterpartyDetail.model_validate(counterparty)
