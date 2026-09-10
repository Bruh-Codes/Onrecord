import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.db import get_session
from app.errors import not_found
from app.models.notification import Notification
from app.schemas.notification import NotificationOut, NotificationPage, NotificationReadAll

router = APIRouter(tags=["notifications"])


@router.get("/v1/businesses/{business_id}/notifications", response_model=NotificationPage)
async def list_notifications(
    business_id: uuid.UUID,
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> NotificationPage:
    conditions = [Notification.business_id == business_id, Notification.user_id == claims.user_id]
    if unread_only:
        conditions.append(Notification.read_at.is_(None))
    rows = (await session.scalars(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )).all()
    unread_count = await session.scalar(
        select(func.count(Notification.id)).where(
            Notification.business_id == business_id,
            Notification.user_id == claims.user_id,
            Notification.read_at.is_(None),
        )
    )
    return NotificationPage(
        items=[NotificationOut.model_validate(row) for row in rows],
        unread_count=int(unread_count or 0),
    )


@router.post("/v1/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> NotificationOut:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == claims.user_id,
        )
    )
    if notification is None:
        raise not_found("NOTIFICATION_NOT_FOUND", "No notification with that id.")
    await require_business_access(notification.business_id, claims, session)
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/v1/businesses/{business_id}/notifications/read-all", response_model=NotificationReadAll)
async def mark_all_notifications_read(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> NotificationReadAll:
    result = await session.execute(
        update(Notification)
        .where(
            Notification.business_id == business_id,
            Notification.user_id == claims.user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return NotificationReadAll(updated=result.rowcount or 0)
