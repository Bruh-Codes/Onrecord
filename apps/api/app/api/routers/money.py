"""Money in and out, straight from confirmed transactions.

These endpoints feed the Money page. They share their queries with Ona's
tools, so the page and the assistant always show the same figures.
"""

import json
import uuid
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError, forbidden, not_found
from app.models.document import Document
from app.models.enums import Direction, Role
from app.models.transaction import Transaction
from app.services.audit import write_audit_event
from app.services.hand_entries import (
    MONEY_IN_CATEGORIES,
    MONEY_OUT_CATEGORIES,
    add_hand_entry,
    categories_for,
)
from app.services.ona_tools import (
    cash_flow,
    category_breakdown,
    farm_breakdown,
    find_transactions,
    top_counterparties,
)

router = APIRouter(tags=["money"])


@router.get("/v1/businesses/{business_id}/money/summary")
async def money_summary(
    business_id: uuid.UUID,
    from_date: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    farm_activity: str | None = Query(None, max_length=80),
    season: str | None = Query(None, max_length=80),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    dates = {"start_date": from_date.isoformat() if from_date else None, "end_date": to.isoformat() if to else None}
    window = {**dates, "farm_activity": farm_activity, "season": season}
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
        "example_season_available": settings.demo_mode_enabled and earliest is None,
        "farm": await farm_breakdown(session, business_id, dates),
        "farm_tags": await _farm_tags(session, business_id),
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
    farm_activity: str | None = Query(None, max_length=80),
    season: str | None = Query(None, max_length=80),
    sort: str = Query("newest", pattern="^(newest|oldest|largest)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    args = {
        "query": q, "direction": direction, "category": category, "sort": sort,
        "start_date": from_date.isoformat() if from_date else None, "end_date": to.isoformat() if to else None,
        "farm_activity": farm_activity, "season": season,
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
                "category_l2": row.category_l2,
                "farm_activity": row.farm_activity,
                "season": row.season,
                "hand_entered": bool((row.flags or {}).get("hand_entered")),
                "counterparty": (row.flags or {}).get("counterparty"),
                "description": row.description,
                "document_id": str(row.document_id),
                "document_name": filenames.get(row.document_id),
                "internal_transfer": bool((row.flags or {}).get("internal_transfer")),
            }
            for row in rows
        ],
    }


async def _farm_tags(session: AsyncSession, business_id: uuid.UUID) -> dict:
    """Every crop/animal and season used so far, to suggest in forms and filters."""
    base = select(Transaction).join(Document, Transaction.document_id == Document.id).where(
        Transaction.business_id == business_id, Document.deleted_at.is_(None),
    ).subquery()
    activities = (await session.scalars(
        select(base.c.farm_activity).where(base.c.farm_activity.is_not(None)).distinct().order_by(base.c.farm_activity)
    )).all()
    seasons = (await session.scalars(
        select(base.c.season).where(base.c.season.is_not(None)).distinct().order_by(base.c.season)
    )).all()
    return {"activities": list(activities), "seasons": list(seasons)}


class RecordCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    direction: Direction
    occurred_on: date
    amount_pesewas: int = Field(gt=0, le=100_000_000_000, strict=True)
    category: str = Field(min_length=1, max_length=60)
    description: str | None = Field(None, max_length=300)
    counterparty: str | None = Field(None, max_length=120)
    farm_activity: str | None = Field(None, max_length=80)
    season: str | None = Field(None, max_length=80)

    @model_validator(mode="after")
    def known_category(self):
        if self.category not in categories_for(self.direction):
            raise ValueError("Choose what the money was for from the list.")
        if self.occurred_on > date.today() + timedelta(days=1):
            raise ValueError("The date can't be in the future.")
        return self


def _require_owner(claims: Claims) -> None:
    if claims.role not in {Role.OWNER, Role.ADMIN}:
        raise forbidden("Only the business owner can add records.")


async def _after_change(business_id: uuid.UUID) -> None:
    from app.workers.tasks import recompute

    recompute.delay(str(business_id))


@router.get("/v1/money/record-categories")
async def record_categories(claims: Claims = Depends(verify_token)) -> dict:
    return {"in": list(MONEY_IN_CATEGORIES), "out": list(MONEY_OUT_CATEGORIES)}


@router.post("/v1/businesses/{business_id}/money/records", status_code=201)
async def add_record(
    business_id: uuid.UUID,
    body: RecordCreate,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """A sale or cost with no statement behind it, typed in by the owner."""
    _require_owner(claims)
    row = await add_hand_entry(session, business_id, claims.user_id, **body.model_dump())
    await write_audit_event(session, business_id=business_id, actor=claims.user_id, action="transaction.hand_entry",
                            target=f"transaction:{row.id}", after=body.model_dump(mode="json"))
    await session.commit()
    await _after_change(business_id)
    return {"id": str(row.id)}


@router.post("/v1/businesses/{business_id}/money/example-season", status_code=201)
async def add_example_season(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Demo only: Yaw's tomato season, loaded into an empty business and marked as an example."""
    _require_owner(claims)
    if not settings.demo_mode_enabled:
        raise not_found("DEMO_DISABLED", "Example records are only available in demo mode.")
    existing = await session.scalar(select(func.count()).select_from(Transaction).where(Transaction.business_id == business_id))
    if existing:
        raise AppError("BUSINESS_HAS_RECORDS", "Example records can only be added to a business with no records yet.", 409)
    fixture = json.loads((Path(__file__).parents[2] / "fixtures" / "example_season.json").read_text())
    for record in fixture["records"]:
        cedis, pesewas = record["amount_ghs"].split(".")
        await add_hand_entry(
            session, business_id, claims.user_id,
            direction=Direction(record["direction"]), occurred_on=date.fromisoformat(record["date"]),
            amount_pesewas=int(cedis) * 100 + int(pesewas), category=record["category"],
            description=record["description"], counterparty=record.get("counterparty"),
            farm_activity=fixture["farm_activity"], season=fixture["season"], extra_flags={"example": True},
        )
    await write_audit_event(session, business_id=business_id, actor=claims.user_id,
                            action="transaction.example_season", target=f"business:{business_id}")
    await session.commit()
    await _after_change(business_id)
    return {"added": len(fixture["records"])}
