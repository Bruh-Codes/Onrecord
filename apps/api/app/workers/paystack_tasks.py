"""Keep connected Paystack accounts in step: a sweep every few minutes, plus Sync now."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.paystack import PaystackConnection
from app.pipeline.recompute import recompute_business
from app.services.paystack import ledger, secrets
from app.services.paystack.client import PaystackClient, PaystackError
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

SYNCABLE = ("active", "needs_attention")
# Problems that clear up on their own; anything else needs the owner.
TRANSIENT = ("PAYSTACK_UNREACHABLE",)


@celery_app.task(name="paystack.sync")
def sync_paystack(connection_id: str) -> dict:
    from app.db import engine_sync

    with Session(engine_sync) as session:
        return run_sync(session, uuid.UUID(connection_id))


def run_sync(session: Session, connection_id: uuid.UUID, *, client: PaystackClient | None = None) -> dict:
    # skip_locked: a sync already running for this account wins; this one stops.
    connection = session.scalar(
        select(PaystackConnection).where(PaystackConnection.id == connection_id).with_for_update(skip_locked=True)
    )
    if connection is None or connection.status not in SYNCABLE or not connection.key_ciphertext:
        return {"skipped": True}
    business_id = connection.business_id
    try:
        if client is None:
            client = PaystackClient(secrets.decrypt(connection.key_ciphertext))
        with client:
            result = ledger.sync_connection(session, connection, client)
    except (PaystackError, secrets.PaystackKeyError) as error:
        session.rollback()
        connection = session.get(PaystackConnection, connection_id)
        connection.last_checked_at = datetime.now(UTC)
        connection.last_error = error.message
        if error.code not in TRANSIENT:
            connection.status = "needs_attention"
        session.commit()
        logger.info("Paystack sync stopped connection=%s code=%s", connection_id, error.code)
        return {"error": error.code}
    session.commit()
    if result.get("changed"):
        recompute_business(session, business_id)
    return result


@celery_app.task(name="paystack.sync_due")
def sync_due() -> int:
    """Queue every connected Paystack account that hasn't been checked for a while."""
    from app.db import engine_sync

    # A little under the interval, so a sweep every 5 minutes doesn't skip a beat.
    cutoff = datetime.now(UTC) - timedelta(minutes=get_settings().paystack_sync_interval_minutes) + timedelta(seconds=30)
    with Session(engine_sync) as session:
        ids = session.scalars(select(PaystackConnection.id).where(
            PaystackConnection.status == "active",
            or_(PaystackConnection.last_checked_at.is_(None), PaystackConnection.last_checked_at < cutoff),
        )).all()
    for connection_id in ids:
        sync_paystack.delay(str(connection_id))
    return len(ids)
