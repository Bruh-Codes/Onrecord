"""Durable notification generation for business attention items."""

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.enums import DocStatus, GapStatus
from app.models.scoring import Gap
from app.models.transaction import Transaction
from app.models.user import User
from app.models.notification import Notification


def sync_business_notifications(db: Session, business_id: uuid.UUID) -> None:
    """Synchronize actionable business state into one notification per kind.

    Notifications are state-based, not emitted on every recompute. A changed
    fingerprint reopens the item; an unchanged fingerprint preserves its read
    state. This keeps worker retries idempotent while still notifying when new
    documents or gaps change the underlying state.
    """
    users = db.scalars(
        select(User).where(User.business_id == business_id, User.is_active.is_(True))
    ).all()
    if not users:
        return

    documents = db.scalars(
        select(Document).where(Document.business_id == business_id, Document.deleted_at.is_(None))
    ).all()
    transactions = db.scalars(
        select(Transaction)
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.business_id == business_id, Document.deleted_at.is_(None))
    ).all()
    pending = [
        transaction
        for transaction in transactions
        if transaction.category_l1 in (None, "unknown")
        and not (transaction.flags or {}).get("classification_reviewed")
    ]
    gaps = db.scalars(
        select(Gap).where(Gap.business_id == business_id, Gap.status == GapStatus.OPEN)
    ).all()

    states: list[dict] = []
    if pending:
        total = sum(transaction.amount_pesewas for transaction in pending)
        states.append({
            "kind": "classification",
            "dedupe_key": "classification_queue",
            "severity": "attention",
            "title": "Transactions need classification",
            "body": f"{len(pending)} transaction(s) totaling {_format_ghs(total)} need a category review.",
            "href": "/reviewer",
            "data": {"count": len(pending), "amount_pesewas": total},
        })

    if gaps:
        states.append({
            "kind": "gaps",
            "dedupe_key": "open_gaps",
            "severity": "attention",
            "title": "Readiness gaps need attention",
            "body": f"{len(gaps)} open gap(s) are still blocking a lender-ready profile.",
            "href": "/gaps",
            "data": {"count": len(gaps), "gap_ids": [str(gap.id) for gap in gaps]},
        })

    for document in documents:
        review = (document.quality_flags or {}).get("evidence_review")
        review_status = review.get("status") if isinstance(review, dict) else None
        needs_attention = document.status in {DocStatus.FAILED, DocStatus.RECONCILIATION_FAILED} or review_status in {"warning", "error"}
        if not needs_attention:
            continue
        reason = (
            review.get("summary")
            if isinstance(review, dict) and isinstance(review.get("summary"), str)
            else "The document needs review before it can support readiness scoring."
        )
        states.append({
            "kind": "document_review",
            "dedupe_key": f"document:{document.id}",
            "severity": "warning" if review_status == "warning" else "attention",
            "title": f"Review {document.filename}",
            "body": reason,
            "href": "/documents",
            "data": {"document_id": str(document.id), "status": document.status.value, "review_status": review_status},
        })

    managed_keys = {"classification_queue", "open_gaps"} | {
        state["dedupe_key"] for state in states if state["kind"] == "document_review"
    }
    now = datetime.now(UTC)
    for user in users:
        existing = db.scalars(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.business_id == business_id,
            )
        ).all()
        existing_by_key = {notification.dedupe_key: notification for notification in existing}
        active_keys = set()
        for state in states:
            key = state["dedupe_key"]
            active_keys.add(key)
            fingerprint = _fingerprint(state["data"])
            notification = existing_by_key.get(key)
            if notification is None:
                db.add(Notification(
                    user_id=user.id,
                    business_id=business_id,
                    kind=state["kind"],
                    severity=state["severity"],
                    title=state["title"],
                    body=state["body"],
                    href=state["href"],
                    dedupe_key=key,
                    fingerprint=fingerprint,
                    data=state["data"],
                ))
                continue
            if notification.fingerprint != fingerprint:
                notification.kind = state["kind"]
                notification.severity = state["severity"]
                notification.title = state["title"]
                notification.body = state["body"]
                notification.href = state["href"]
                notification.fingerprint = fingerprint
                notification.data = state["data"]
                notification.read_at = None

        # A resolved queue or closed gap should no longer keep a red badge.
        for key, notification in existing_by_key.items():
            if key in managed_keys and key not in active_keys and notification.read_at is None:
                notification.read_at = now


def _fingerprint(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _format_ghs(pesewas: int) -> str:
    return f"GH¢{pesewas / 100:,.2f}"

