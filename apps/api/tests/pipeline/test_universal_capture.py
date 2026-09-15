from app.models.enums import DocType
from app.pipeline.s2_classify import classify_document
from app.pipeline.s3_extract import parse_statement
from app.services.document_processing import DocumentCell, DocumentTable


def test_parses_common_bank_export_headers_without_a_balance_column():
    table = DocumentTable(
        page=3,
        row_count=3,
        column_count=4,
        cells=tuple(
            DocumentCell(row, column, value, page=3, bbox=None)
            for row, values in enumerate([
                ["Posted", "Narration", "Dr", "Cr"],
                ["2026-09-01", "Customer payment", "", "100.00"],
                ["02/09/2026", "Supplier purchase", "25.00", ""],
            ])
            for column, value in enumerate(values)
        ),
    )

    rows, error = parse_statement("", [table])

    assert error is None
    assert [(row.direction, row.amount_pesewas, row.page) for row in rows] == [
        ("in", 10_000, 3),
        ("out", 2_500, 3),
    ]


def test_unknown_financial_shape_is_captured_for_review():
    result = classify_document(
        "Date | Details | Value\n2026-09-01 | POS settlement | 100.00",
        "export.dat",
        has_tables=True,
    )

    assert result.doc_type == DocType.OTHER
    assert result.supported is True
    assert "captured" in result.reason
