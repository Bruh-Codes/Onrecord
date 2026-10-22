from datetime import date

from app.pipeline.s3_ai_normalise import mask_identifiers, normalize_rows, reconcile, to_pesewas
from app.services.document_reader import DocumentReading, ReadRow


def _row(amount="10.00", direction="in", balance=None, fee=None, levy=None, occurred_on="2026-03-04", **extra):
    return ReadRow(
        occurred_on=occurred_on, description=extra.get("description", "Payment"), counterparty=extra.get("counterparty"),
        reference=extra.get("reference"), direction=direction, amount=amount, fee=fee, levy=levy,
        balance_after=balance, category="unknown", page=1, source_ref="page:1",
    )


def _reading(rows, opening=None, closing=None):
    return DocumentReading(
        doc_type="momo_statement", provider="MTN", account_label="1234", currency="GHS",
        period_start=None, period_end=None, opening_balance=opening, closing_balance=closing,
        confidence=0.9, summary="", findings=(), rows=tuple(rows), model="test",
    )


def test_to_pesewas_parses_printed_amounts_without_floats():
    assert to_pesewas("1,250.00") == 125000
    assert to_pesewas("GHS 1,250.5") == 125050
    assert to_pesewas("GH¢ 20") == 2000
    assert to_pesewas("(50.00)") == 5000
    assert to_pesewas("-7.10") == 710
    assert to_pesewas("300.00 CR") == 30000
    assert to_pesewas("0.1") == 10
    assert to_pesewas("12.345") is None
    assert to_pesewas("abc") is None
    assert to_pesewas(None) is None


def test_mask_identifiers_keeps_last_three_digits():
    assert mask_identifiers("Transfer from 0244123456 KWAME") == "Transfer from •••456 KWAME"
    assert mask_identifiers("+233 24 412 3456") == "•••456"
    assert mask_identifiers("Invoice 2026") == "Invoice 2026"


def test_normalize_rows_rejects_unparseable_rows():
    rows, rejected = normalize_rows(_reading([
        _row(), _row(amount="n/a"), _row(occurred_on="04/03/2026"), _row(direction="sideways"),
    ]))
    assert len(rows) == 1 and rejected == 3
    assert rows[0].occurred_on == date(2026, 3, 4)
    assert rows[0].amount_pesewas == 1000


def test_running_balances_reconcile_including_fees_and_levy():
    rows, _ = normalize_rows(_reading([
        _row("100.00", "in", balance="100.00"),
        _row("50.00", "out", balance="49.25", fee="0.50", levy="0.25"),
        _row("20.00", "in", balance="69.25"),
    ]))
    assert reconcile(rows, None, None).status == "reconciled"


def test_newest_first_statements_reconcile():
    rows, _ = normalize_rows(_reading([
        _row("20.00", "in", balance="69.25"),
        _row("50.00", "out", balance="49.25", fee="0.50", levy="0.25"),
        _row("100.00", "in", balance="100.00"),
    ]))
    assert reconcile(rows, None, None).status == "reconciled"


def test_balance_break_is_reported():
    rows, _ = normalize_rows(_reading([
        _row("100.00", "in", balance="100.00"),
        _row("50.00", "out", balance="80.00"),
        _row("20.00", "in", balance="100.00"),
    ]))
    result = reconcile(rows, None, None)
    assert result.status == "balance_breaks"
    assert result.balance_breaks == 1


def test_opening_and_closing_balance_check():
    rows, _ = normalize_rows(_reading([_row("100.00", "in"), _row("40.00", "out")]))
    assert reconcile(rows, "10.00", "70.00").status == "reconciled"
    assert reconcile(rows, "10.00", "90.00").status == "balance_breaks"


def test_rows_without_balances_are_unverifiable():
    rows, _ = normalize_rows(_reading([_row("100.00", "in"), _row("40.00", "out")]))
    assert reconcile(rows, None, None).status == "unverifiable"
