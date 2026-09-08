"""Background pipeline tasks.

For the MVP recompute is the backbone: it derives coverage, indicators,
checklist, gaps and score from whatever data already exists. The S1-S6
ingestion stages are added here as they land.
"""

from celery import shared_task
from sqlalchemy.orm import Session

from app.pipeline.recompute import recompute_business
from app.workers.celery_app import celery_app


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
    """S1 placeholder-marks a document as ingested and hands off to S2.
    Real value lands when OCR/storage are wired (see README known gaps)."""
    from app.db import engine_sync

    with Session(engine_sync) as session:
        from app.models.document import Document
        from app.models.enums import DocStatus

        doc = session.get(Document, document_id)
        if doc is None:
            return {"status": "not_found"}
        if doc.status == DocStatus.RECEIVED:
            doc.status = DocStatus.CLASSIFIED
            session.commit()
        return {"status": doc.status.value, "document_id": str(doc.id)}