"""Background pipeline tasks."""

import logging
import hashlib
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Account
from app.models.document import Document, Extraction
from app.models.enums import AccountKind, DocStatus, DocType, Provider
from app.pipeline.recompute import recompute_business
from app.pipeline.s3_extract import ParsedRow, parse_statement
from app.pipeline.s3_financial_statement import FinancialField, parse_financial_statement
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
    """Read, classify, and extract a supported financial statement."""
    from app.db import engine_sync
    from app.pipeline.s2_classify import classify_document
    from app.services.document_processing import DoclingProcessor
    from app.services.storage import get_storage_backend

    with Session(engine_sync) as session:
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
        if result.supported and doc.doc_type in {
            DocType.BANK_STATEMENT,
            DocType.MOMO_STATEMENT,
            DocType.MOMO_MERCHANT_STATEMENT,
        }:
            parsed_rows, extraction_error = parse_statement(processed.text)
            if extraction_error:
                doc.status = DocStatus.CLASSIFIED
                doc.quality_flags["extraction_error"] = extraction_error
                session.commit()
                return {"status": doc.status.value, "document_id": str(doc.id), "extracted_rows": 0}
            _persist_transactions(session, doc, processed.text, parsed_rows)
            doc.status = DocStatus.EXTRACTED
        elif result.supported and doc.doc_type == DocType.FINANCIAL_STATEMENT:
            fields, extraction_error = parse_financial_statement(processed.text)
            if extraction_error:
                doc.status = DocStatus.CLASSIFIED
                doc.quality_flags["extraction_error"] = extraction_error
                session.commit()
                return {"status": doc.status.value, "document_id": str(doc.id), "extracted_fields": 0}
            _persist_financial_fields(session, doc, fields)
            doc.quality_flags["financial_statement_fields"] = len(fields)
            doc.status = DocStatus.EXTRACTED
        else:
            doc.status = DocStatus.CLASSIFIED if result.supported else DocStatus.FAILED
        session.commit()
        if doc.status == DocStatus.EXTRACTED:
            recompute.delay(str(doc.business_id))
        return {"status": doc.status.value, "document_id": str(doc.id), "supported": result.supported}


def _persist_transactions(session: Session, doc: Document, text: str, rows: list[ParsedRow]) -> None:
    identifier = _account_identifier(text, doc)
    identifier_hash = hashlib.sha256(identifier.encode("utf-8")).hexdigest()
    account = session.scalar(
        select(Account).where(Account.business_id == doc.business_id, Account.identifier_hash == identifier_hash)
    )
    if account is None:
        provider = doc.issuer or Provider.OTHER_BANK
        kind = AccountKind.MOMO if doc.doc_type in {DocType.MOMO_STATEMENT, DocType.MOMO_MERCHANT_STATEMENT} else AccountKind.BANK
        account = Account(
            business_id=doc.business_id,
            kind=kind,
            provider=provider,
            identifier_hash=identifier_hash,
            display_suffix=identifier[-4:],
        )
        session.add(account)
        session.flush()

    extraction_rows: list[Extraction] = []
    for row in rows:
        extraction = Extraction(
            document_id=doc.id,
            page=row.page,
            field_path=f"transactions[{len(extraction_rows)}]",
            value_json={
                "occurred_on": row.occurred_on.isoformat(),
                "description": row.description,
                "direction": row.direction,
                "amount_pesewas": row.amount_pesewas,
                "balance_after_pesewas": row.balance_after_pesewas,
            },
            extractor="parser:docling_markdown_table_v1",
            confidence=0.85,
        )
        session.add(extraction)
        extraction_rows.append(extraction)
    session.flush()

    from app.models.transaction import Transaction

    for row, extraction in zip(rows, extraction_rows, strict=True):
        session.add(
            Transaction(
                business_id=doc.business_id,
                account_id=account.id,
                document_id=doc.id,
                occurred_on=row.occurred_on,
                direction=row.direction,
                amount_pesewas=row.amount_pesewas,
                balance_after_pesewas=row.balance_after_pesewas,
                counterparty_raw=row.description or None,
                flags={},
                provenance={"extraction_ids": [str(extraction.id)]},
            )
        )


def _persist_financial_fields(session: Session, doc: Document, fields: list[FinancialField]) -> None:
    for field in fields:
        session.add(
            Extraction(
                document_id=doc.id,
                page=field.page,
                field_path=f"financial_statement.{field.key}",
                value_json={
                    "label": field.label,
                    "value_pesewas": field.value_pesewas,
                    "raw_value": field.raw_value,
                },
                extractor="parser:financial_statement_markdown_v1",
                confidence=0.85,
            )
        )


def _account_identifier(text: str, doc: Document) -> str:
    match = re.search(
        r"(?:account|wallet|mobile)\s*(?:number|no|id)?\s*[:#-]?\s*([A-Za-z0-9+/-]{5,})",
        text,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    return f"{doc.issuer.value if doc.issuer else 'unknown'}:{doc.id}"


def _safe_filename(storage_key: str) -> str:
    """Docling selects a converter from the suffix; never trust uploaded paths."""
    return Path(storage_key).name or "upload.pdf"
