from app.pipeline.s3_extract import parse_statement


def test_parse_statement_table_with_debit_credit_and_balance():
    text = """
    | Date | Description | Debit | Credit | Balance |
    | --- | --- | ---: | ---: | ---: |
    | 2026-09-01 | Cash In from Customer |  | 1,250.00 | 1,250.00 |
    | 02/09/2026 | POS purchase supplies | 300.50 |  | 949.50 |
    """

    rows, error = parse_statement(text)

    assert error is None
    assert len(rows) == 2
    assert rows[0].direction == "in"
    assert rows[0].amount_pesewas == 125_000
    assert rows[1].direction == "out"
    assert rows[1].amount_pesewas == 30_050
    assert rows[1].balance_after_pesewas == 94_950


def test_parser_rejects_text_without_unambiguous_rows():
    rows, error = parse_statement("This is a bank statement with no readable transaction table.")

    assert rows == []
    assert error is not None
