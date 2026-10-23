import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.db import get_session
from app.errors import AppError, forbidden, not_found
from app.models.agriculture import Enterprise, FarmEntry, ProductionCycle
from app.models.business import Business
from app.models.enums import Role
from app.schemas.agriculture import CycleCreate, CycleOut, EnterpriseCreate, EnterpriseOut, EntryOut, EntryWrite, FarmReport, FarmSummary
from app.schemas.common import Page
from app.services.audit import write_audit_event
from app.services.farm_finance import build_report
from app.services.farm_records import enterprise_for, entry_snapshot, load_entries, now, prepare_entry, validate_scope
from app.services.farm_taxonomy import TEMPLATES

router = APIRouter(prefix="/v1/businesses/{business_id}/farm", tags=["agriculture"])


def require_write(claims):
    if claims.role not in {Role.OWNER, Role.ADMIN}:
        raise forbidden("Only the business owner may change farm records.")


async def audit(session, claims, business_id, action, row, before=None, after=None):
    await write_audit_event(session, business_id=business_id, actor=claims.user_id, action=action,
                           target=f"{row.__tablename__}:{row.id}", before=before, after=after)


@router.get("/enterprises", response_model=Page[EnterpriseOut])
async def enterprises(
    business_id: uuid.UUID, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    query = select(Enterprise).where(Enterprise.business_id == business_id)
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(query.order_by(Enterprise.created_at).offset((page-1)*page_size).limit(page_size))
    return Page(items=[EnterpriseOut.model_validate(row) for row in rows], total=count or 0, page=page, page_size=page_size)


@router.post("/enterprises", response_model=EnterpriseOut, status_code=201)
async def create_enterprise(
    business_id: uuid.UUID, body: EnterpriseCreate,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    require_write(claims)
    if body.subtype not in TEMPLATES[body.type.value]["subtypes"]:
        raise AppError("INVALID_SUBTYPE", "Choose a supported enterprise subtype or Other.", 422)
    if body.type.value != "crop" and body.metadata_json.area is not None:
        raise AppError("INVALID_METADATA", "Crop area belongs to crop enterprises.", 422)
    row = Enterprise(business_id=business_id, **body.model_dump())
    session.add(row)
    await session.flush()
    await audit(session, claims, business_id, "farm.enterprise.create", row, after=body.model_dump(mode="json"))
    await session.commit()
    return row


@router.get("/cycles", response_model=Page[CycleOut])
async def cycles(
    business_id: uuid.UUID, enterprise_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    await validate_scope(session, business_id, enterprise_id)
    query = select(ProductionCycle).where(ProductionCycle.business_id == business_id)
    if enterprise_id:
        query = query.where(ProductionCycle.enterprise_id == enterprise_id)
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(query.order_by(ProductionCycle.start_date.desc()).offset((page-1)*page_size).limit(page_size))
    return Page(items=[CycleOut.model_validate(row) for row in rows], total=count or 0, page=page, page_size=page_size)


@router.post("/cycles", response_model=CycleOut, status_code=201)
async def create_cycle(
    business_id: uuid.UUID, body: CycleCreate,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    require_write(claims)
    enterprise = await enterprise_for(session, business_id, body.enterprise_id)
    if body.metadata_json.batch_size is not None and enterprise.type.value == "crop":
        raise AppError("INVALID_METADATA", "Batch size belongs to livestock or aquaculture.", 422)
    if body.metadata_json.pond_count is not None and enterprise.type.value != "aquaculture":
        raise AppError("INVALID_METADATA", "Pond count belongs to aquaculture.", 422)
    row = ProductionCycle(business_id=business_id, **body.model_dump())
    session.add(row)
    await session.flush()
    await audit(session, claims, business_id, "farm.cycle.create", row, after=body.model_dump(mode="json"))
    await session.commit()
    return row


async def filtered_entries(session, business_id, enterprise_id, cycle_id, from_date, to_date):
    if from_date and to_date and from_date > to_date:
        raise AppError("INVALID_PERIOD", "Report end must be on or after its start.", 422)
    await validate_scope(session, business_id, enterprise_id, cycle_id)
    return await load_entries(session, business_id, enterprise_id, cycle_id, from_date, to_date)


@router.get("/entries", response_model=Page[EntryOut])
async def entries(
    business_id: uuid.UUID, enterprise_id: uuid.UUID | None = None, cycle_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"), to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    rows = await filtered_entries(session, business_id, enterprise_id, cycle_id, from_date, to)
    return Page(items=rows[(page-1)*page_size:page*page_size], total=len(rows), page=page, page_size=page_size)


@router.post("/entries", response_model=EntryOut, status_code=201)
async def create_entry(
    business_id: uuid.UUID, body: EntryWrite,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    require_write(claims)
    values = await prepare_entry(session, business_id, body)
    row = FarmEntry(business_id=business_id, created_by=claims.user_id, updated_at=now(), **values)
    session.add(row)
    await session.flush()
    await audit(session, claims, business_id, "farm.entry.create", row, after=entry_snapshot(row))
    await session.commit()
    return next(item for item in await load_entries(session, business_id) if item.id == row.id)


async def entry_for(session, business_id, entry_id):
    row = await session.scalar(select(FarmEntry).where(FarmEntry.id == entry_id, FarmEntry.business_id == business_id, FarmEntry.deleted_at.is_(None)).with_for_update())
    if row is None:
        raise not_found("FARM_ENTRY_NOT_FOUND", "No active farm entry with that id.")
    return row


@router.put("/entries/{entry_id}", response_model=EntryOut)
async def update_entry(
    business_id: uuid.UUID, entry_id: uuid.UUID, body: EntryWrite,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    require_write(claims)
    row = await entry_for(session, business_id, entry_id)
    before = entry_snapshot(row)
    for key, value in (await prepare_entry(session, business_id, body, entry_id)).items():
        setattr(row, key, value)
    row.updated_at = now()
    await audit(session, claims, business_id, "farm.entry.update", row, before=before, after=entry_snapshot(row))
    await session.commit()
    return next(item for item in await load_entries(session, business_id) if item.id == row.id)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(
    business_id: uuid.UUID, entry_id: uuid.UUID,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    require_write(claims)
    row = await entry_for(session, business_id, entry_id)
    before = entry_snapshot(row)
    row.deleted_at = row.updated_at = now()
    await audit(session, claims, business_id, "farm.entry.delete", row, before=before)
    await session.commit()
    return Response(status_code=204)


@router.get("/summary", response_model=FarmSummary)
@router.get("/report", response_model=FarmReport)
async def report(
    business_id: uuid.UUID, enterprise_id: uuid.UUID | None = None, cycle_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"), to: date | None = None,
    claims: Claims = Depends(require_business_access), session: AsyncSession = Depends(get_session),
):
    business = await session.get(Business, business_id)
    if business is None:
        raise not_found("BUSINESS_NOT_FOUND", "No business with that id.")
    rows = await filtered_entries(session, business_id, enterprise_id, cycle_id, from_date, to)
    cycle = await session.get(ProductionCycle, cycle_id) if cycle_id else None
    return build_report(business, rows, enterprise_id=enterprise_id, cycle_id=cycle_id, from_date=from_date, to_date=to, cycle=cycle)
