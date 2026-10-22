"""Owner review of rows Claude read from a document."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_document_access, verify_token
from app.db import get_session
from app.errors import AppError
from app.models.document import Document, Extraction
from app.pipeline.s3_ai_ingest import FIELD_PREFIX, OWNER_CORRECTION, commit_staged_rows
from app.schemas.document_review import ConfirmResult, ConfirmRows, ExtractedRow, ExtractedRows
from app.services.audit import write_audit_event
from app.services.notifications import sync_business_notifications

router = APIRouter(tags=["documents"])

_EDITABLE = (
    "occurred_on", "description", "counterparty", "direction", "amount_pesewas",
    "fee_pesewas", "levy_pesewas", "balance_after_pesewas", "category_l1",
)


@router.get("/v1/documents/{document_id}/extracted-rows", response_model=ExtractedRows)
async def get_extracted_rows(
    document_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> ExtractedRows:
    _, document = await require_document_access(document_id, claims=claims, session=session)
    return _rows_out(document, await _staged(session, document))


@router.post("/v1/documents/{document_id}/extracted-rows/confirm", response_model=ConfirmResult)
async def confirm_extracted_rows(
    document_id: uuid.UUID,
    body: ConfirmRows,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> ConfirmResult:
    _, document = await require_document_access(document_id, claims=claims, session=session)
    meta = (document.quality_flags or {}).get("ai_ingest") or {}
    if meta.get("state") != "needs_review":
        raise AppError("REVIEW_NOT_PENDING", "This document has no rows waiting for review.", 409)

    staged = {extraction.id: extraction for extraction in await _staged(session, document)}
    unknown = [str(decision.id) for decision in body.rows if decision.id not in staged]
    if unknown:
        raise AppError("UNKNOWN_ROWS", "Some rows don't belong to this document.", 422, {"row_ids": unknown})

    corrected = excluded = 0
    for decision in body.rows:
        original = staged[decision.id]
        edits = {
            field: (value.isoformat() if field == "occurred_on" else value)
            for field in _EDITABLE
            if (value := getattr(decision, field)) is not None
        }
        updated = {**original.value_json, **edits, "excluded": not decision.include}
        if updated == {**original.value_json, "excluded": bool(original.value_json.get("excluded"))}:
            continue
        # Extractions are append-only: a correction is a new row that
        # supersedes the model's reading, keeping both for the audit trail.
        correction = Extraction(
            document_id=document.id,
            page=original.page,
            field_path=original.field_path,
            value_json={**updated, "corrected": bool(edits)},
            extractor=OWNER_CORRECTION,
            confidence=1.0,
        )
        session.add(correction)
        await session.flush()
        original.superseded_by = correction.id
        corrected += bool(edits)
        excluded += not decision.include

    result = await session.run_sync(lambda sync: commit_staged_rows(sync, document, confirmed_by=claims.user_id))
    await write_audit_event(
        session,
        business_id=document.business_id,
        actor=claims.user_id,
        action="document.rows_confirm",
        target=f"document:{document.id}",
        after={"corrected_rows": corrected, "excluded_rows": excluded, **result},
    )
    await session.run_sync(lambda sync: sync_business_notifications(sync, document.business_id))
    await session.commit()

    from app.workers.tasks import recompute

    recompute.delay(str(document.business_id))
    return ConfirmResult(document_id=document.id, state="confirmed", **result)


async def _staged(session: AsyncSession, document: Document) -> list[Extraction]:
    rows = await session.scalars(
        select(Extraction).where(
            Extraction.document_id == document.id,
            Extraction.superseded_by.is_(None),
            Extraction.field_path.like(f"{FIELD_PREFIX}%"),
        )
    )
    return sorted(rows, key=lambda row: int(row.field_path[len(FIELD_PREFIX):-1]))


def _rows_out(document: Document, staged: list[Extraction]) -> ExtractedRows:
    meta = (document.quality_flags or {}).get("ai_ingest") or {}
    return ExtractedRows(
        document_id=document.id,
        state=meta.get("state", "none"),
        summary=meta.get("summary", ""),
        findings=list(meta.get("findings", [])),
        reconciliation=meta.get("reconciliation"),
        confidence=meta.get("confidence"),
        model=meta.get("model"),
        rows=[ExtractedRow(id=row.id, **_public(row.value_json)) for row in staged],
    )


def _public(value: dict) -> dict:
    return {key: value[key] for key in ExtractedRow.model_fields if key != "id" and key in value}
