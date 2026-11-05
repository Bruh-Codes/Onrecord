"""Context for Ona when a reviewer has an upload open on the Approvals page.

The open upload's rows, reader notes and balance check go into the snapshot,
so every Ona provider sees them and its grounding check can trace any figure
Ona quotes back to them. Ona stays read-only: it helps the reviewer decide but
never approves or rejects anything itself.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, Extraction
from app.pipeline.s3_ai_ingest import FIELD_PREFIX

MAX_ROWS = 200

REVIEWER_NOTE = (
    "You are talking with an OnRecord reviewer on the Approvals page, not the business owner. "
    "Refer to the business by name in the third person. Help them decide whether open_upload can be "
    "approved: check its rows against the reader notes and the balance check, point out rows that look "
    "missing, duplicated or out of order, and say plainly when the read looks incomplete (for example the "
    "notes mention far more rows or pages than were read). Only state figures that appear in the snapshot "
    "or tool results. You cannot approve or reject anything; the reviewer does that with the buttons on the "
    "page. When asked, draft a short, kind note to the owner that says what is wrong and what to upload instead."
)


def _ghs(pesewas: object) -> str | None:
    if not isinstance(pesewas, (int, float)):
        return None
    return f"GH¢{pesewas / 100:,.2f}"


async def open_upload_context(session: AsyncSession, document: Document) -> dict[str, Any]:
    """A compact, figure-ready description of one upload for the reviewer's chat."""
    flags = document.quality_flags or {}
    review = flags.get("evidence_review") if isinstance(flags.get("evidence_review"), dict) else {}
    ingest = flags.get("ai_ingest") if isinstance(flags.get("ai_ingest"), dict) else {}
    extractions = (await session.scalars(
        select(Extraction).where(
            Extraction.document_id == document.id,
            Extraction.superseded_by.is_(None),
            Extraction.field_path.like(f"{FIELD_PREFIX}%"),
        )
    )).all()
    ordered = sorted(extractions, key=lambda row: int(row.field_path[len(FIELD_PREFIX):-1]))
    rows = []
    for extraction in ordered[:MAX_ROWS]:
        value = extraction.value_json or {}
        rows.append({
            "n": int(extraction.field_path[len(FIELD_PREFIX):-1]) + 1,
            "date": value.get("occurred_on"),
            "description": str(value.get("description") or "")[:80],
            "direction": value.get("direction"),
            "amount": _ghs(value.get("amount_pesewas")),
            "balance_after": _ghs(value.get("balance_after_pesewas")),
            "page": value.get("page"),
            "excluded_by_owner": bool(value.get("excluded")),
            "edited_by_owner": bool(value.get("corrected")),
        })
    reconciliation = ingest.get("reconciliation") if isinstance(ingest.get("reconciliation"), dict) else None
    return {
        "document_id": str(document.id),
        "filename": document.filename,
        "doc_type": document.doc_type.value if document.doc_type else None,
        "pages": document.page_count,
        "period_start": document.period_start.isoformat() if document.period_start else None,
        "period_end": document.period_end.isoformat() if document.period_end else None,
        "uploaded_at": document.created_at.isoformat() if document.created_at else None,
        "review_status": review.get("status"),
        "review_summary": review.get("summary"),
        "review_findings": [
            {"code": f.get("code"), "reason": f.get("reason")}
            for f in review.get("findings", []) if isinstance(f, dict)
        ],
        "owner_checked_rows": ingest.get("state") == "confirmed",
        "reader_summary": ingest.get("summary"),
        "reader_notes": list(ingest.get("findings") or []),
        "reader_marked_truncated": bool(ingest.get("truncated")),
        "balance_check": reconciliation,
        "opening_balance": _ghs(ingest.get("opening_balance_pesewas")),
        "closing_balance": _ghs(ingest.get("closing_balance_pesewas")),
        "rows_read": len(ordered),
        "rows_shown": len(rows),
        "rows": rows,
    }


async def reviewer_context(
    session: AsyncSession, business_id: uuid.UUID, document_id: uuid.UUID | None
) -> dict[str, Any]:
    context: dict[str, Any] = {"note": REVIEWER_NOTE}
    if document_id is None:
        return context
    document = await session.scalar(select(Document).where(
        Document.id == document_id,
        Document.business_id == business_id,
        Document.deleted_at.is_(None),
    ))
    if document is not None:
        context["open_upload"] = await open_upload_context(session, document)
    return context
