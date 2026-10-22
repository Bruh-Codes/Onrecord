"""Money in and out, straight from confirmed transactions.

These endpoints feed the Money page. They share their queries with Ona's
tools, so the page and the assistant always show the same figures.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.db import get_session
from app.models.document import Document
from app.models.transaction import Transaction
from app.services.ona_tools import (
    cash_flow,
    category_breakdown,
    find_transactions,
    top_counterparties,
)

router = APIRouter(tags=["money"])


@router.get("/v1/businesses/{business_id}/money/summary")
async def money_summary(
    business_id: uuid.UUID,
    from_date: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    window = {"start_date": from_date.isoformat() if from_date else None, "end_date": to.isoformat() if to else None}
    earliest, latest = (await session.execute(
        select(func.min(Transaction.occurred_on), func.max(Transaction.occurred_on))
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.business_id == business_id, Document.deleted_at.is_(None))
    )).one()
    documents = (await session.scalars(
        select(Document.quality_flags).where(Document.business_id == business_id, Document.deleted_at.is_(None))
    )).all()
    awaiting = sum(((flags or {}).get("ai_ingest") or {}).get("state") == "needs_review" for flags in documents)
    return {
        "earliest_on": earliest.isoformat() if earliest else None,
        "latest_on": latest.isoformat() if latest else None,
        "documents_awaiting_review": awaiting,
        "cash_flow": await cash_flow(session, business_id, {"group_by": "month", **window}),
        "top_customers": await top_counterparties(session, business_id, {"direction": "in", "limit": 6, **window}),
        "top_suppliers": await top_counterparties(session, business_id, {"direction": "out", "limit": 6, **window}),
        "categories": await category_breakdown(session, business_id, window),
    }


@router.get("/v1/businesses/{business_id}/money/transactions")
async def money_transactions(
    business_id: uuid.UUID,
    q: str | None = Query(None, max_length=80),
    direction: str | None = Query(None, pattern="^(in|out)$"),
    category: str | None = Query(None, max_length=40),
    from_date: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    sort: str = Query("newest", pattern="^(newest|oldest|largest)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    args = {
        "query": q, "direction": direction, "category": category, "sort": sort,
        "start_date": from_date.isoformat() if from_date else None, "end_date": to.isoformat() if to else None,
    }
    totals, rows = await find_transactions(session, business_id, args, offset=offset, limit=limit)
    document_ids = {row.document_id for row in rows}
    filenames = {
        document.id: document.filename
        for document in (await session.scalars(select(Document).where(Document.id.in_(document_ids)))).all()
    } if document_ids else {}
    return {
        **totals,
        "offset": offset,
        "items": [
            {
                "id": str(row.id),
                "occurred_on": row.occurred_on.isoformat(),
                "direction": row.direction.value,
                "amount_pesewas": row.amount_pesewas,
                "fee_pesewas": row.fee_pesewas + row.levy_pesewas,
                "balance_after_pesewas": row.balance_after_pesewas,
                "category_l1": row.category_l1,
                "counterparty": (row.flags or {}).get("counterparty"),
                "description": row.description,
                "document_id": str(row.document_id),
                "document_name": filenames.get(row.document_id),
                "internal_transfer": bool((row.flags or {}).get("internal_transfer")),
            }
            for row in rows
        ],
    }
