"""Keep connected spreadsheets in step: a sweep every few minutes, plus Sync now."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.sheet_sync import SheetConnection
from app.pipeline.recompute import recompute_business
from app.services.notifications import sync_business_notifications
from app.services.sheet_sync import engine, google
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

SYNCABLE = ("active", "needs_attention")
# Problems that clear up on their own; anything else needs the owner.
TRANSIENT = ("GOOGLE_UNREACHABLE", "GOOGLE_BUSY")


@celery_app.task(name="sheets.sync")
def sync_sheet(connection_id: str, force: bool = False) -> dict:
    from app.db import engine_sync

    with Session(engine_sync) as session:
        return run_sync(session, uuid.UUID(connection_id), force=force)


def run_sync(session: Session, connection_id: uuid.UUID, *, force: bool = False) -> dict:
    # skip_locked: a sync already running for this sheet wins; this one stops.
    connection = session.scalar(
        select(SheetConnection).where(SheetConnection.id == connection_id).with_for_update(skip_locked=True)
    )
    if connection is None or connection.status not in SYNCABLE:
        return {"skipped": True}
    business_id = connection.business_id
    try:
        token = google.access_token(session, connection.connected_by)
        result = engine.sync_connection(session, connection, token, force=force)
    except google.GoogleSheetError as error:
        session.rollback()
        connection = session.get(SheetConnection, connection_id)
        connection.last_checked_at = datetime.now(UTC)
        connection.last_error = error.message
        if error.code not in TRANSIENT:
            connection.status = "needs_attention"
        sync_business_notifications(session, business_id)
        session.commit()
        logger.info("Sheet sync stopped connection=%s code=%s", connection_id, error.code)
        return {"error": error.code}
    session.commit()
    if result.get("changed"):
        recompute_business(session, business_id)
    return result


@celery_app.task(name="sheets.sync_due")
def sync_due() -> int:
    """Queue every connected sheet that hasn't been checked for a while."""
    from app.db import engine_sync

    cutoff = datetime.now(UTC) - timedelta(minutes=get_settings().sheet_sync_interval_minutes)
    with Session(engine_sync) as session:
        ids = session.scalars(select(SheetConnection.id).where(
            SheetConnection.status.in_(SYNCABLE),
            or_(SheetConnection.last_checked_at.is_(None), SheetConnection.last_checked_at < cutoff),
        )).all()
    for connection_id in ids:
        sync_sheet.delay(str(connection_id))
    return len(ids)
