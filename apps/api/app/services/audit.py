import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent


async def write_audit_event(
    session: AsyncSession,
    *,
    business_id: uuid.UUID | None,
    actor: uuid.UUID | None,
    action: str,
    target: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    session.add(
        AuditEvent(
            business_id=business_id,
            actor=actor,
            action=action,
            target=target,
            before=before,
            after=after,
            at=datetime.now(UTC),
        )
    )
