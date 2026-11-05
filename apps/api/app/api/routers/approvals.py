"""Approvals: the reviewer's queue of uploads held out of readiness.

An upload that the AI reader couldn't fully trust (balances don't add up, the
read was cut short, the owner had to confirm rows by hand) is kept out of
readiness scoring until a reviewer approves it. Approve/reject itself lives on
`POST /v1/documents/{id}/evidence-review/resolve`; this router lists the work
across every business the caller may review and serves the original file.
"""

import asyncio
import mimetypes
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, require_role
from app.db import get_session
from app.errors import AppError, not_found
from app.models.access import BusinessAccess
from app.models.business import Business
from app.models.document import Document
from app.models.enums import DocStatus, Role
from app.models.transaction import Transaction
from app.services.storage import StorageBackend, get_storage_backend

router = APIRouter(tags=["approvals"])

# Still being read: nothing for a reviewer to decide yet.
_IN_PROGRESS = {DocStatus.RECEIVED, DocStatus.CLASSIFIED}
_DECIDED = {"approved", "rejected"}


class ApprovalFinding(BaseModel):
    code: str
    severity: str
    reason: str


class ApprovalItem(BaseModel):
    document_id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    filename: str
    mime: str
    doc_type: str | None
    issuer: str | None
    period_start: date | None = None
    period_end: date | None = None
    document_status: str
    uploaded_at: datetime
    review_status: str
    risk_level: str
    summary: str
    findings: list[ApprovalFinding]
    balance_check: str | None
    incomplete_read: bool
    waiting_on_owner: bool
    rows_read: int | None
    transaction_count: int
    money_in_pesewas: int
    money_out_pesewas: int
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    reviewer_note: str | None = None


def needs_approval(document: Document) -> bool:
    """True when an upload is held out of readiness and no reviewer has decided."""
    if document.status in _IN_PROGRESS or document.status == DocStatus.SUPERSEDED:
        return False
    flags = document.quality_flags or {}
    if flags.get("supported") is False:
        return False  # not a financial document; nothing to approve
    review = flags.get("evidence_review")
    if isinstance(review, dict):
        if review.get("status") in _DECIDED:
            return False
        if review.get("scoring_eligible"):
            return False
        return review.get("status") in {"pending", "warning", "error"}
    return document.status in {DocStatus.FAILED, DocStatus.RECONCILIATION_FAILED}


def _item(document: Document, business: Business, totals: dict[str, int]) -> ApprovalItem:
    flags = document.quality_flags or {}
    review = flags.get("evidence_review") if isinstance(flags.get("evidence_review"), dict) else {}
    ingest = flags.get("ai_ingest") if isinstance(flags.get("ai_ingest"), dict) else {}
    findings = [
        ApprovalFinding(code=str(f.get("code", "")), severity=str(f.get("severity", "")), reason=str(f.get("reason", "")))
        for f in review.get("findings", []) if isinstance(f, dict)
    ]
    reconciliation = ingest.get("reconciliation") if isinstance(ingest.get("reconciliation"), dict) else {}
    balance_check = reconciliation.get("status")
    if balance_check is None and document.status == DocStatus.RECONCILIATION_FAILED:
        balance_check = "balance_breaks"
    status = review.get("status") or ("error" if document.status == DocStatus.FAILED else "pending")
    return ApprovalItem(
        document_id=document.id,
        business_id=business.id,
        business_name=business.trading_name or business.legal_name,
        filename=document.filename,
        mime=document.mime,
        doc_type=document.doc_type.value if document.doc_type else None,
        issuer=document.issuer.value if document.issuer else None,
        period_start=document.period_start,
        period_end=document.period_end,
        document_status=document.status.value,
        uploaded_at=document.created_at,
        review_status=status,
        risk_level=review.get("risk_level", "unknown"),
        summary=review.get("summary") or flags.get("processing_error") or flags.get("extraction_error") or "",
        findings=findings,
        balance_check=balance_check,
        incomplete_read=any(f.code == "READ_TRUNCATED" for f in findings) or bool(ingest.get("truncated")),
        waiting_on_owner=ingest.get("state") == "needs_review",
        rows_read=ingest.get("row_count"),
        transaction_count=totals.get("count", 0),
        money_in_pesewas=totals.get("in", 0),
        money_out_pesewas=totals.get("out", 0),
        reviewed_by=review.get("reviewed_by"),
        reviewed_at=review.get("reviewed_at"),
        reviewer_note=review.get("reviewer_note"),
    )


@router.get("/v1/approvals", response_model=list[ApprovalItem])
async def list_approvals(
    state: Literal["open", "done"] = Query("open"),
    limit: int = Query(100, ge=1, le=500),
    claims: Claims = Depends(require_role(Role.REVIEWER, Role.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> list[ApprovalItem]:
    """Uploads waiting for a reviewer (open) or already decided (done).

    Admins see every business. Reviewers see only businesses they hold an
    explicit reviewer grant for (business_access), like everywhere else.
    """
    query = (
        select(Document, Business)
        .join(Business, Business.id == Document.business_id)
        .where(Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
    if claims.role != Role.ADMIN:
        granted = select(BusinessAccess.business_id).where(
            BusinessAccess.user_id == claims.user_id, BusinessAccess.role == Role.REVIEWER
        )
        query = query.where(Document.business_id.in_(granted))

    pairs = []
    for document, business in (await session.execute(query)).all():
        review = (document.quality_flags or {}).get("evidence_review")
        decided = isinstance(review, dict) and review.get("status") in _DECIDED
        if (state == "open" and needs_approval(document)) or (state == "done" and decided):
            pairs.append((document, business))
    if state == "done":
        pairs.sort(key=lambda pair: str(pair[0].quality_flags["evidence_review"].get("reviewed_at") or ""), reverse=True)
    pairs = pairs[:limit]

    totals: dict[uuid.UUID, dict[str, int]] = {}
    if pairs:
        rows = (await session.execute(
            select(Transaction.document_id, Transaction.direction, func.count(), func.coalesce(func.sum(Transaction.amount_pesewas), 0))
            .where(Transaction.document_id.in_([document.id for document, _ in pairs]))
            .group_by(Transaction.document_id, Transaction.direction)
        )).all()
        for document_id, direction, count, amount in rows:
            entry = totals.setdefault(document_id, {"count": 0, "in": 0, "out": 0})
            entry["count"] += int(count)
            entry[direction.value] += int(amount or 0)
    return [_item(document, business, totals.get(document.id, {})) for document, business in pairs]


@router.get("/v1/approvals/{document_id}/file")
async def get_original_file(
    document_id: uuid.UUID,
    claims: Claims = Depends(require_role(Role.REVIEWER, Role.ADMIN)),
    session: AsyncSession = Depends(get_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> Response:
    """The uploaded file itself, so a reviewer can check the rows against it."""
    document = await session.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
    if document is None:
        raise not_found("DOCUMENT_NOT_FOUND", "No document with that id.")
    await require_business_access(document.business_id, claims, session)
    try:
        payload = await asyncio.to_thread(storage.read_bytes, document.storage_key)
    except Exception as exc:
        raise AppError("FILE_UNAVAILABLE", "The original file could not be read from storage.", 404) from exc
    mime = document.mime
    if not mime or mime == "application/octet-stream":
        mime = mimetypes.guess_type(document.filename)[0] or "application/octet-stream"
    safe_name = document.filename.replace('"', "")
    return Response(
        content=payload,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
