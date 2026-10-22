"""Worker entry point for reading a document with Claude."""

import logging

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.enums import DocStatus
from app.pipeline.s3_ai_ingest import stage_reading
from app.services.document_processing import ProcessedDocument
from app.services.document_reader import DocumentReader, DocumentReaderError

logger = logging.getLogger(__name__)


def try_ai_ingest(
    session: Session,
    doc: Document,
    reader: DocumentReader,
    payload: bytes,
    processed: ProcessedDocument | None,
) -> bool:
    """Read the document with Claude. Returns False to fall back to the parser path."""
    flags = {**(doc.quality_flags or {})}
    if processed is not None:
        doc.page_count = processed.page_count
        doc.docling_document = processed.structure
        flags["processor_methods"] = list(processed.methods)
        flags["processor_warnings"] = list(processed.warnings)
    try:
        reading = reader.read(payload, doc.filename, processed)
    except DocumentReaderError as error:
        logger.warning("AI read failed for document_id=%s: %s", doc.id, error)
        doc.quality_flags = {**flags, "ai_ingest": {"state": "failed", "error": str(error)}}
        return False

    if not reading.rows and processed is not None:
        # Not a transaction document (a certificate, a P&L, a letter): the
        # existing classifier and capture path still preserve it as evidence.
        doc.quality_flags = {**flags, "ai_ingest": {"state": "no_transactions", "summary": reading.summary,
                                                     "doc_type": reading.doc_type, "model": reading.model}}
        return False

    doc.quality_flags = flags
    if not reading.rows:
        doc.status = DocStatus.FAILED
        doc.quality_flags = {**flags, "unsupported_document": True,
                             "ai_ingest": {"state": "no_transactions", "summary": reading.summary,
                                           "doc_type": reading.doc_type, "model": reading.model}}
        return True
    stage_reading(session, doc, reading)
    return True
