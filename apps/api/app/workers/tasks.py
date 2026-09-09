"""Background pipeline tasks."""

import logging
import hashlib
import re
from dataclasses import asdict
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
from app.pipeline.s3_financial_statement import FinancialField, parse_financial_statement, summarize_financial_fields
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
    from app.services.financial_mapping import get_structure_mapper
    from app.services.storage import get_storage_backend

    with Session(engine_sync) as session:
        doc = session.scalar(
            select(Document).where(Document.id == document_id, Document.deleted_at.is_(None))
        )
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
        doc.docling_document = processed.structure
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
            fields, extraction_error = parse_financial_statement(
                processed.text,
                processed.tables,
                structure_mapper=get_structure_mapper(),
            )
            if extraction_error:
                doc.status = DocStatus.CLASSIFIED
                doc.quality_flags["extraction_error"] = extraction_error
                session.commit()
                return {"status": doc.status.value, "document_id": str(doc.id), "extracted_fields": 0}
            _persist_financial_fields(session, doc, fields)
            summaries = summarize_financial_fields(processed.text, fields)
            doc.quality_flags["financial_statements"] = [asdict(summary) for summary in summaries]
            doc.quality_flags["financial_statement_values"] = len(fields)
            doc.quality_flags["financial_statement_validation_issues"] = sum(
                len(summary.validation_issues) for summary in summaries
            )
            doc.quality_flags["financial_statement_mapping_review_values"] = sum(
                field.mapping_method == "model" and (field.mapping_confidence or 0) < 0.85
                for field in fields
            )
            doc.quality_flags["financial_statement_structure_review_values"] = sum(
                field.structure_method == "model" and (field.structure_confidence or 0) < 0.85
                for field in fields
            )
            doc.quality_flags["financial_statement_unmapped_values"] = sum(
                field.canonical_concept is None for field in fields
            )
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
                "category_l1": row.category_l1,
                "category_l2": row.category_l2,
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
                category_l1=row.category_l1,
                category_l2=row.category_l2,
                category_confidence=row.category_confidence,
                category_source=row.category_source,
                flags={},
                provenance={"extraction_ids": [str(extraction.id)]},
            )
        )


def _persist_financial_fields(session: Session, doc: Document, fields: list[FinancialField]) -> None:
    period_indexes: dict[tuple[int, str], int] = {}
    for field in fields:
        period_key = (field.statement_index, field.period)
        if period_key not in period_indexes:
            period_indexes[period_key] = len([key for key in period_indexes if key[0] == field.statement_index])
        session.add(
            Extraction(
                document_id=doc.id,
                page=field.page,
                field_path=(
                    f"financial_statements[{field.statement_index}].line_items[{field.line_index}]"
                    f".values[{period_indexes[period_key]}]"
                ),
                value_json={
                    "source_id": field.source_id,
                    "label": field.label,
                    "section": field.section,
                    "parent_line_index": field.parent_line_index,
                    "depth": field.depth,
                    "is_total": field.is_total,
                    "statement_type": field.statement_type,
                    "period": field.period,
                    "value_pesewas": field.value_pesewas,
                    "raw_value": field.raw_value,
                    "kind": "extracted",
                    "canonical_concept": field.canonical_concept,
                    "mapping_confidence": field.mapping_confidence,
                    "mapping_method": field.mapping_method,
                    "structure_confidence": field.structure_confidence,
                    "structure_method": field.structure_method,
                },
                bbox=field.bbox,
                extractor="parser:docling_financial_table_v2",
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
