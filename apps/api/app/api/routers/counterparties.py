import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.db import get_session
from app.errors import not_found
from app.models.enums import CounterpartyKind
from app.models.transaction import Counterparty
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
    cond = [Counterparty.business_id == business_id]
    if kind is not None:
        cond.append(Counterparty.kind == kind)
    if search:
        cond.append(Counterparty.canonical_name.ilike(f"%{search.strip().upper()}%"))

    base_query = select(Counterparty).where(*cond)
    total = await session.scalar(select(func.count()).select_from(base_query.subquery()))
    rows = await session.scalars(
        base_query.order_by(Counterparty.total_in_pesewas.desc())
        .order_by(Counterparty.total_out_pesewas.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [CounterpartyDetail.model_validate(row) for row in rows]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/{counterparty_id}", response_model=CounterpartyDetail)
async def get_counterparty(
    business_id: uuid.UUID,
    counterparty_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> CounterpartyDetail:
    counterparty = await session.get(Counterparty, counterparty_id)
    if counterparty is None or counterparty.business_id != business_id:
        raise not_found("COUNTERPARTY_NOT_FOUND", "No counterparty with that id.")
    return CounterpartyDetail.model_validate(counterparty)