import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, require_document_access, verify_token
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import file_too_large
from app.errors import duplicate_document as duplicate_document_error
from app.models.document import Document
from app.schemas.common import Page
from app.schemas.document import (
    DocumentConfirm,
    DocumentCreate,
    DocumentDetail,
    DocumentSummary,
    DocumentUploadTarget,
)
from app.services.audit import write_audit_event
from app.services.storage import get_storage_backend

router = APIRouter(tags=["documents"])


@router.post("/v1/businesses/{business_id}/documents", response_model=DocumentUploadTarget, status_code=201)
async def create_document(
    business_id: uuid.UUID,
    body: DocumentCreate,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> DocumentUploadTarget:
    if body.size_bytes > settings.max_document_size_bytes:
        raise file_too_large(settings.max_document_size_bytes)

    existing = await session.scalar(
        select(Document).where(Document.business_id == business_id, Document.sha256 == body.sha256)
    )
    if existing is not None:
        raise duplicate_document_error(str(existing.id))

    storage_key = f"{business_id}/{uuid.uuid4()}/{body.filename}"
    document = Document(
        business_id=business_id,
        uploaded_by=claims.user_id,
        storage_key=storage_key,
        sha256=body.sha256,
        mime=body.mime,
    )
    session.add(document)
    await session.flush()
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="document.create",
        target=f"document:{document.id}",
        after={"filename": body.filename, "mime": body.mime, "size_bytes": body.size_bytes},
    )
    await session.commit()

    upload = get_storage_backend(settings).create_upload_url(storage_key, body.mime)
    return DocumentUploadTarget(
        document_id=document.id,
        upload_url=upload.url,
        upload_expires_at=upload.expires_at,
    )


@router.post("/v1/documents/{document_id}/complete", status_code=202)
async def complete_document_upload(
    document_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _, document = await require_document_access(document_id, claims=claims, session=session)

    # TODO: enqueue S1 ingest once app/workers/tasks.py exists. Status stays
    # "received" until the pipeline picks it up.
    await write_audit_event(
        session,
        business_id=document.business_id,
        actor=claims.user_id,
        action="document.complete",
        target=f"document:{document.id}",
    )
    await session.commit()
    return {"status": document.status.value}


@router.get("/v1/businesses/{business_id}/documents", response_model=Page[DocumentSummary])
async def list_documents(
    business_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Page[DocumentSummary]:
    base_query = select(Document).where(Document.business_id == business_id, Document.deleted_at.is_(None))

    total = await session.scalar(select(func.count()).select_from(base_query.subquery()))
    rows = await session.scalars(
        base_query.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = [DocumentSummary.model_validate(row) for row in rows]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/v1/documents/{document_id}", response_model=DocumentDetail)
async def get_document(
    document_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> DocumentDetail:
    _, document = await require_document_access(document_id, claims=claims, session=session)
    return DocumentDetail.model_validate(document)


@router.post("/v1/documents/{document_id}/confirm", response_model=DocumentDetail)
async def confirm_document_type(
    document_id: uuid.UUID,
    body: DocumentConfirm,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> DocumentDetail:
    _, document = await require_document_access(document_id, claims=claims, session=session)

    before = {"doc_type": document.doc_type.value if document.doc_type else None}
    document.doc_type = body.doc_type
    document.doc_type_confidence = 1.0  # owner-confirmed

    # TODO: re-enqueue S2 onward once app/workers/tasks.py exists.
    await write_audit_event(
        session,
        business_id=document.business_id,
        actor=claims.user_id,
        action="document.confirm",
        target=f"document:{document.id}",
        before=before,
        after={"doc_type": body.doc_type.value},
    )
    await session.commit()
    await session.refresh(document)
    return DocumentDetail.model_validate(document)


@router.delete("/v1/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> None:
    _, document = await require_document_access(document_id, claims=claims, session=session)

    document.deleted_at = datetime.now(UTC)
    await write_audit_event(
        session,
        business_id=document.business_id,
        actor=claims.user_id,
        action="document.delete",
        target=f"document:{document.id}",
    )
    await session.commit()
