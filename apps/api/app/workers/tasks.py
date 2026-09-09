"""Background pipeline tasks."""

import logging
from pathlib import Path
from tempfile import TemporaryDirectory

from celery import shared_task
from sqlalchemy.orm import Session

from app.pipeline.recompute import recompute_business
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="recompute")
def recompute(business_id: str) -> dict:
    """(Re)compute all derived analytics for a business. Idempotent (INV-4)."""
    from app.db import engine_sync

    with Session(engine_sync) as session:
        return recompute_business(session, business_id)


@shared_task(name="ping")
def ping() -> str:
    return "pong"


@celery_app.task(name="ingest_document.s1")
def s1_ingest(document_id: str) -> dict:
    """Read an upload with Docling, classify supported financial documents."""
    from app.db import engine_sync
    from app.models.enums import DocStatus
    from app.pipeline.s2_classify import classify_document
    from app.services.document_processing import DoclingProcessor
    from app.services.storage import get_storage_backend

    with Session(engine_sync) as session:
        from app.models.document import Document

        doc = session.get(Document, document_id)
        if doc is None:
            return {"status": "not_found"}
        if doc.status != DocStatus.RECEIVED:
            return {"status": doc.status.value, "document_id": str(doc.id)}

        try:
            payload = get_storage_backend().read_bytes(doc.storage_key)
            with TemporaryDirectory() as directory:
                source = Path(directory, _safe_filename(doc.storage_key))
                source.write_bytes(payload)
                processed = DoclingProcessor().process(source)
            result = classify_document(processed.text, doc.storage_key)
        except Exception as exc:
            # Keep the document bytes and extracted content out of logs, but
            # retain the traceback needed to distinguish storage, model, and
            # parsing failures in the worker logs.
            logger.exception("Document processing failed for document_id=%s", document_id)
            doc.status = DocStatus.FAILED
            doc.quality_flags = {**(doc.quality_flags or {}), "processing_error": type(exc).__name__}
            session.commit()
            return {"status": doc.status.value, "document_id": str(doc.id)}

        doc.page_count = processed.page_count
        doc.doc_type = result.doc_type
        doc.doc_type_confidence = result.confidence
        doc.issuer = result.issuer
        doc.period_start = result.period_start
        doc.period_end = result.period_end
        doc.quality_flags = {
            **(doc.quality_flags or {}),
            "processor": "docling",
            "classification_reason": result.reason,
            "supported": result.supported,
        }
        doc.status = DocStatus.CLASSIFIED if result.supported else DocStatus.FAILED
        session.commit()
        return {"status": doc.status.value, "document_id": str(doc.id), "supported": result.supported}


def _safe_filename(storage_key: str) -> str:
    """Docling selects a converter from the suffix; never trust uploaded paths."""
    return Path(storage_key).name or "upload.pdf"
