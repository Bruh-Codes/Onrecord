"""Persistence of parser output for financial statements and invoices."""

from sqlalchemy.orm import Session

from app.models.document import Document, Extraction
from app.pipeline.s3_extract import ParsedRow
from app.pipeline.s3_financial_statement import FinancialField
from app.pipeline.s3_invoice import ParsedInvoice


def persist_financial_fields(session: Session, doc: Document, fields: list[FinancialField]) -> None:
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


def transaction_quality(rows: list[ParsedRow]) -> dict[str, int]:
    return {
        "rows_total": len(rows),
        "rows_missing_balance": sum("balance_missing" in row.quality_flags for row in rows),
        "rows_with_description_artifacts": sum("description_artifact" in row.quality_flags for row in rows),
        "rows_with_truncated_descriptions": sum("description_truncated" in row.quality_flags for row in rows),
    }


def persist_invoice(session: Session, doc: Document, invoice: ParsedInvoice) -> None:
    for field in invoice.fields:
        session.add(Extraction(
            document_id=doc.id,
            page=field.page,
            field_path=f"invoice.{field.key}",
            value_json={"value": field.value, "raw_value": field.raw_value, "source_label": field.source_label},
            extractor="parser:docling_invoice_dynamic_v1",
            confidence=field.confidence,
        ))
    for index, item in enumerate(invoice.line_items):
        session.add(Extraction(
            document_id=doc.id,
            page=item.page,
            field_path=f"invoice.line_items[{index}]",
            value_json={
                "description": item.description,
                "quantity": item.quantity,
                "unit_price_pesewas": item.unit_price_pesewas,
                "line_total_pesewas": item.line_total_pesewas,
                "raw": item.raw,
            },
            extractor="parser:docling_invoice_dynamic_v1",
            confidence=0.80,
        ))
