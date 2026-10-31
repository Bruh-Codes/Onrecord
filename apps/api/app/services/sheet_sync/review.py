"""The owner's answers to rows OnRecord wasn't sure about, and the bell items for them."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.sheet_sync import SheetConnection, SheetRow
from app.services.sheet_sync import records

# reason -> actions the owner may take, in the order the app shows them.
ACTIONS: dict[str, tuple[str, ...]] = {
    "unreadable": ("skip",),
    "possible_duplicate": ("skip", "add"),
    "large_amount": ("add", "skip"),
    "old_edit": ("accept", "keep"),
    "old_removal": ("remove", "keep"),
}


class ReviewError(Exception):
    pass


def needs_review_filter():
    return or_(SheetRow.status == "needs_review", SheetRow.review_reason.is_not(None))


def resolve(session: Session, connection: SheetConnection, row: SheetRow, action: str, user_id: uuid.UUID) -> SheetRow:
    reason = row.review_reason
    if reason is None or action not in ACTIONS.get(reason, ()):
        raise ReviewError("That choice isn't available for this row.")
    if action in ("add", "accept"):
        if row.transaction_id:
            records.apply_edit(session, connection, row)
        else:
            records.record_row(session, connection, row)
    elif action == "skip":
        row.status = "skipped"
    elif action == "remove":
        records.remove_record(session, row)
        row.status = "removed"
    elif action == "keep":
        # old_edit: the ledger keeps the earlier figures. old_removal: the record stays.
        row.status = "recorded" if reason == "old_edit" else "kept"
    row.review_reason = None
    row.history = [*(row.history or []), {
        "event": "owner_review", "reason": reason, "action": action,
        "by": str(user_id), "at": datetime.now(UTC).isoformat(),
    }]
    session.flush()
    return row


def notification_states(session: Session, business_id: uuid.UUID) -> list[dict]:
    """One bell item per connected sheet: a problem, rows to check, or new records."""
    connections = session.scalars(select(SheetConnection).where(
        SheetConnection.business_id == business_id, SheetConnection.status != "disconnected",
    )).all()
    pending = dict(session.execute(
        select(SheetRow.connection_id, func.count()).where(
            SheetRow.connection_id.in_([connection.id for connection in connections]), needs_review_filter(),
        ).group_by(SheetRow.connection_id)
    ).all()) if connections else {}
    states = []
    for connection in connections:
        name = connection.spreadsheet_name
        base = {"dedupe_key": f"sheet:{connection.id}", "href": f"/apps/sheets/{connection.id}"}
        count = pending.get(connection.id, 0)
        result = connection.last_result or {}
        if connection.status in ("needs_attention", "needs_mapping") and connection.last_error:
            states.append({**base, "kind": "sheet_sync", "severity": "attention",
                           "title": f"Your {name} sheet needs attention", "body": connection.last_error,
                           "data": {"status": connection.status, "error": connection.last_error}})
        elif count:
            states.append({**base, "kind": "sheet_sync", "severity": "attention",
                           "title": f"{count} row(s) from {name} need a quick look",
                           "body": "OnRecord wasn't sure about these rows, so they are waiting for you.",
                           "data": {"pending": count}})
        elif result.get("added"):
            states.append({**base, "kind": "sheet_sync", "severity": "info",
                           "title": f"{result['added']} new record(s) from your {name} sheet",
                           "body": "They are in Records and count towards your totals.",
                           "data": {"added": result["added"], "synced_at": result.get("synced_at")}})
    return states


def managed_keys(session: Session, business_id: uuid.UUID) -> set[str]:
    ids = session.scalars(select(SheetConnection.id).where(SheetConnection.business_id == business_id)).all()
    return {f"sheet:{connection_id}" for connection_id in ids}
