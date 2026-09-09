from app.pipeline.s3_financial_statement import parse_financial_statement


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
