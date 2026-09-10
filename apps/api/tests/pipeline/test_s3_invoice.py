from app.pipeline.s3_invoice import parse_invoice
from app.services.document_processing.docling import DocumentCell, DocumentTable


def test_invoice_parser_keeps_canonical_and_dynamic_fields() -> None:
    parsed = parse_invoice("""
        Cloudflare, Inc.
        Invoice Number: CF-1007
        Invoice Date: 01 Sep 2026
        Due Date: 15 Sep 2026
        Currency: USD
        Subtotal: $100.00
        Tax: $18.00
        Total: $118.00
        Payment Status: Unpaid
        Purchase Order: PO-9
    """)
    assert parsed.get("supplier").value == "Cloudflare, Inc."
    assert parsed.get("invoice_number").value == "CF-1007"
    assert parsed.get("total").value["amount_pesewas"] == 11800
    assert parsed.get("payment_status").value == "unpaid"
    assert parsed.extra_fields["purchase_order"] == "PO-9"
    assert parsed.validation_issues == []


def test_invoice_parser_does_not_invent_missing_total() -> None:
    parsed = parse_invoice("Supplier: Example Ltd\nSubtotal: GHS 20.00")
    assert parsed.get("total") is None
    assert "total_missing" in parsed.validation_issues


def test_invoice_parser_reads_totals_from_docling_table_cells() -> None:
    table = DocumentTable(
        page=1,
        row_count=3,
        column_count=2,
        cells=(
            DocumentCell(0, 0, "Subtotal", 1, None),
            DocumentCell(0, 1, "USD 100.00", 1, None),
            DocumentCell(1, 0, "Tax", 1, None),
            DocumentCell(1, 1, "USD 18.00", 1, None),
            DocumentCell(2, 0, "Total", 1, None),
            DocumentCell(2, 1, "USD 118.00", 1, None),
        ),
    )
    parsed = parse_invoice("Supplier: Example Ltd", (table,))
    assert parsed.get("total").value["amount_pesewas"] == 11800
    assert parsed.validation_issues == []


def test_invoice_parser_reads_flattened_label_value_lines() -> None:
    parsed = parse_invoice("""
        Example Supplier
        Invoice # Z-9
        Total (USD) 118.00
    """)
    assert parsed.get("invoice_number").value == "Z-9"
    assert parsed.get("total").value["amount_pesewas"] == 11800
