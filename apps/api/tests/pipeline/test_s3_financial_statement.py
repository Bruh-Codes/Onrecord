from app.pipeline.s3_financial_statement import parse_financial_statement, summarize_financial_fields
from app.services.document_processing import DocumentCell, DocumentTable
from app.services.financial_mapping import StatementStructure, StructureAnnotation


def test_extracts_explicit_financial_statement_fields():
    fields, error = parse_financial_statement(
        """
        | Revenue | GH¢ 120,000.00 |
        | Cost of sales | 70,000.00 |
        | Gross profit | 50,000.00 |
        | Total assets | 200,000.00 |
        | Total liabilities | 80,000.00 |
        | Equity | 120,000.00 |
        """
    )

    assert error is None
    assert {field.key for field in fields} == {
        "revenue",
        "cost_of_sales",
        "gross_profit",
        "total_assets",
        "total_liabilities",
        "equity",
    }
    assert next(field for field in fields if field.key == "revenue").value_pesewas == 12_000_000


def test_does_not_infer_missing_fields():
    fields, error = parse_financial_statement("Revenue: not stated")

    assert fields == []
    assert error is not None


def test_preserves_dynamic_multi_period_rows_and_provenance():
    table = _table([
        ["Particulars", "Note", "2025", "2024"],
        ["Revenue", "3", "1,200.00", "950.00"],
        ["Community development levy", "4", "(25.00)", "-"],
        ["Total assets", "", "2,000.00", "1,800.00"],
        ["Total liabilities", "", "800.00", "700.00"],
        ["Total equity", "", "1,200.00", "1,100.00"],
    ])

    fields, error = parse_financial_statement("Statement of financial position", [table])

    assert error is None
    assert len(fields) == 10
    levy = next(field for field in fields if field.label == "Community development levy" and field.period == "2025")
    assert levy.value_pesewas == -2_500
    assert levy.canonical_concept is None
    assert levy.page == 2
    assert levy.bbox == {"l": 20, "t": 20, "r": 30, "b": 30}
    assert {field.period for field in fields} == {"2025", "2024"}
    assert not any(field.raw_value in {"3", "4"} for field in fields)

    summaries = summarize_financial_fields("Statement of financial position", fields)
    assert summaries[0].statement_type == "balance_sheet"
    assert summaries[0].validation_issues == ()


def test_applies_printed_scale_and_flags_failed_accounting_equation():
    table = _table([
        ["Particulars", "2025"],
        ["Total assets", "10"],
        ["Total liabilities", "4"],
        ["Equity", "5"],
    ])

    fields, error = parse_financial_statement("Amounts are in GHS thousands", [table])
    summaries = summarize_financial_fields("Amounts are in GHS thousands", fields)

    assert error is None
    assert fields[0].value_pesewas == 1_000_000
    assert summaries[0].scale == 1_000
    assert summaries[0].validation_issues == ("accounting_equation_failed:2025",)


def test_model_structures_rows_without_changing_source_values():
    class Mapper:
        def structure_rows(self, rows, detected_statement_type):
            assert [row.label for row in rows] == ["Operating costs", "Custom power expense"]
            assert detected_statement_type == "other"
            assert not hasattr(rows[0], "value_pesewas")
            return StatementStructure(
                statement_type="income_statement",
                statement_type_confidence=0.94,
                annotations=(
                    StructureAnnotation("s0:l0", "Operating expenses", None, 0, True, "operating_expenses", 0.95),
                    StructureAnnotation("s0:l1", "Operating expenses", "s0:l0", 1, False, None, 0.91),
                ),
            )

    table = _table([
        ["Particulars", "2025"],
        ["Operating costs", "125.50"],
        ["Custom power expense", "20.00"],
    ])

    fields, error = parse_financial_statement("", [table], structure_mapper=Mapper())

    assert error is None
    assert fields[0].value_pesewas == 12_550
    assert fields[1].value_pesewas == 2_000
    assert fields[1].parent_line_index == 0
    assert fields[1].depth == 1
    assert fields[1].section == "Operating expenses"
    assert fields[1].structure_method == "model"
    assert fields[0].statement_type == "income_statement"


def test_rejects_foreign_currency_instead_of_treating_it_as_pesewas():
    fields, error = parse_financial_statement("| Revenue | USD 100.00 |")

    assert fields == []
    assert error == "Unsupported financial-statement currency: USD"


def test_parses_currency_prefixed_parentheses_as_negative():
    fields, error = parse_financial_statement("| Revenue | GHS (100.00) |")

    assert error is None
    assert fields[0].value_pesewas == -10_000


def _table(rows: list[list[str]]) -> DocumentTable:
    cells = tuple(
        DocumentCell(
            row=row_index,
            column=column_index,
            text=value,
            page=2,
            bbox={"l": column_index * 10, "t": row_index * 10, "r": column_index * 10 + 10, "b": row_index * 10 + 10},
            column_header=row_index == 0,
        )
        for row_index, row in enumerate(rows)
        for column_index, value in enumerate(row)
    )
    return DocumentTable(page=2, row_count=len(rows), column_count=max(map(len, rows)), cells=cells)
