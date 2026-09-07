import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, require_role, verify_token
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import not_found
from app.models.enums import GapStatus
from app.models.scoring import ChecklistItem, Gap, Indicator, ReadinessScore
from app.schemas.analytics import (
    ChecklistItemOut,
    Coverage,
    GapOut,
    GapWaive,
    IndicatorOut,
    ReadinessScoreOut,
)
from app.services.audit import write_audit_event
from app.services.coverage import build_coverage

router = APIRouter(tags=["analytics"])


@router.get("/v1/businesses/{business_id}/coverage", response_model=Coverage)
async def get_coverage(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Coverage:
    coverage = await build_coverage(session, business_id)
    return Coverage.model_validate(coverage)


@router.get("/v1/businesses/{business_id}/indicators", response_model=list[IndicatorOut])
async def list_indicators(
    business_id: uuid.UUID,
    window: str = Query("12m"),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> list[IndicatorOut]:
    rows = (
        await session.scalars(
            select(Indicator)
            .where(Indicator.business_id == business_id)
            .order_by(Indicator.code, Indicator.period_start.desc())
        )
    ).all()
    return [IndicatorOut.model_validate(r) for r in rows]


@router.get("/v1/businesses/{business_id}/score", response_model=ReadinessScoreOut)
async def get_score(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> ReadinessScoreOut:
    row = await session.scalar(
        select(ReadinessScore)
        .where(ReadinessScore.business_id == business_id)
        .order_by(ReadinessScore.computed_at.desc())
        .limit(1)
    )
    if row is None:
        raise not_found("SCORE_NOT_FOUND", "No score has been computed yet for this business. Trigger a recompute.")
    return ReadinessScoreOut.model_validate(row)


@router.get("/v1/businesses/{business_id}/checklist", response_model=list[ChecklistItemOut])
async def get_checklist(
    business_id: uuid.UUID,
    rule_pack: str = Query("gh_mfi_working_capital_v1"),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> list[ChecklistItemOut]:
    rows = (
        await session.scalars(
            select(ChecklistItem).where(
                ChecklistItem.business_id == business_id,
                ChecklistItem.rule_pack_id == rule_pack,
            )
        )
    ).all()
    return [ChecklistItemOut.model_validate(r) for r in rows]


@router.get("/v1/businesses/{business_id}/gaps", response_model=list[GapOut])
async def list_gaps(
    business_id: uuid.UUID,
    status: GapStatus | None = Query(None),
    severity: str | None = Query(None),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> list[GapOut]:
    cond = [Gap.business_id == business_id]
    if status is not None:
        cond.append(Gap.status == status)
    if severity is not None:
        cond.append(Gap.severity == severity)
    rows = (await session.scalars(select(Gap).where(*cond).order_by(Gap.created_at.desc()))).all()
    return [GapOut.model_validate(r) for r in rows]


@router.post("/v1/gaps/{gap_id}/waive", response_model=GapOut)
async def waive_gap(
    gap_id: uuid.UUID,
    body: GapWaive,
    claims: Claims = Depends(require_role("reviewer", "admin")),
    session: AsyncSession = Depends(get_session),
) -> GapOut:
    gap = await session.get(Gap, gap_id)
    if gap is None:
        raise not_found("GAP_NOT_FOUND", "No gap with that id.")
    require_business_access(gap.business_id, claims)

    before = {"status": gap.status.value}
    gap.status = GapStatus.WAIVED
    gap.resolution = {"reason": body.reason}
    gap.resolved_at = datetime.now(UTC)
    await write_audit_event(
        session,
        business_id=gap.business_id,
        actor=claims.user_id,
        action="gap.waive",
        target=f"gap:{gap.id}",
        before=before,
        after={"status": gap.status.value, "reason": body.reason},
    )
    await session.commit()
    await session.refresh(gap)
    return GapOut.model_validate(gap)


@router.post("/v1/businesses/{business_id}/recompute", status_code=202)
async def recompute(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    from app.workers.tasks import recompute as recompute_task

    result = recompute_task.delay(str(business_id))
    return {"task_id": result.id, "state": "PENDING"}


@router.get("/v1/tasks/{task_id}")
async def get_task(
    task_id: str,
    claims: Claims = Depends(verify_token),
) -> dict:
    from celery.result import AsyncResult
    from app.workers.celery_app import celery_app

    result = AsyncResult(task_id, app=celery_app)
    return {"task_id": task_id, "state": result.state, "progress": 100 if result.successful() else 0, "result": result.result}