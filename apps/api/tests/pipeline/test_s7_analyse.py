import uuid
from datetime import date

from app.pipeline import s7_analyse


def _txn(day, direction, category, amount, balance=None, flags=None):
    return s7_analyse.Txn(
        id=uuid.uuid4(),
        account_id=uuid.uuid4(),
        occurred_on=date.fromisoformat(day),
        direction=direction,
        amount_pesewas=amount,
        category_l1=category,
        category_l2=None,
        balance_after_pesewas=balance,
        flags=flags or {},
    )


def _ctx(txns):
    start = date(2026, 1, 1)
    end = date(2026, 12, 31)
    return s7_analyse.AnalysisContext(business_id=uuid.uuid4(), window_start=start, window_end=end, txns=txns)


def test_revenue_monthly_series():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-20", "in", "revenue", 5000),
        _txn("2026-02-02", "in", "revenue", 7000),
    ]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    series = indicators["REV_MONTHLY"]["value_json"]["series"]
    jan = [s for s in series if s["m"] == "2026-01"][0]
    assert jan["v"] == 15_000


def test_transaction_value_contains_dynamic_category_breakdown():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "out", "opex", 2_000),
        _txn("2026-01-07", "in", "financing_in", 5_000),
    ]

    indicator = next(i for i in s7_analyse.compute_indicators(_ctx(txns)) if i["code"] == "TRANSACTION_VALUE")
    breakdown = indicator["value_json"]["breakdown"]
    assert [(item["key"], item["label"], item["value"]) for item in breakdown] == [
        ("revenue", "Revenue", 10_000),
        ("financing_in", "Financing in", 5_000),
        ("opex", "Operating expenses", 2_000),
    ]
    assert breakdown[0]["series"][-1] == {"m": "2026-12", "v": 0}


def test_financing_in_is_not_revenue():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "in", "financing_in", 500_000),  # loan disbursement
        _txn("2026-01-07", "in", "internal", 30_000),
    ]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    rev = indicators["REV_MONTHLY"]["value_json"]["series"]
    jan = [s for s in rev if s["m"] == "2026-01"][0]
    assert jan["v"] == 10_000


def test_unclassified_ratio_counts_unknown():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "out", "unknown", 2_000),
        _txn("2026-01-07", "out", "opex", 1_000),
    ]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    ratio = indicators["UNCLASSIFIED_RATIO"]["value_json"]["v"]
    assert ratio == round(2_000 / 13_000, 4)


def test_opex_ratio_excludes_financing_and_owner():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "out", "opex", 2_000),
        _txn("2026-01-07", "out", "financing_out", 1_000),  # loan repayment
        _txn("2026-01-08", "out", "owner", 500),
    ]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    ratio = indicators["OPEX_RATIO"]["value_json"]["v"]
    assert ratio == 2_000 / 10_000


def test_duplicate_and_internal_transfers_excluded():
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "in", "revenue", 10_000, flags={"duplicate": True}),
        _txn("2026-01-07", "in", "internal", 5_000, flags={"internal_transfer": True}),
    ]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    rev = indicators["REV_MONTHLY"]["value_json"]["series"]
    jan = [s for s in rev if s["m"] == "2026-01"][0]
    assert jan["v"] == 10_000


def test_negative_balance_days_requires_balances():
    txns = [_txn("2026-01-05", "in", "revenue", 10_000)]
    indicators = {i["code"]: i for i in s7_analyse.compute_indicators(_ctx(txns))}
    assert indicators["NEGATIVE_BALANCE_DAYS"]["value_json"]["status"] == "insufficient_data"


def test_every_indicator_carries_inputs(invs=False):
    txns = [
        _txn("2026-01-05", "in", "revenue", 10_000),
        _txn("2026-01-06", "out", "opex", 2_000, balance=8_000),
    ]
    for ind in s7_analyse.compute_indicators(_ctx(txns)):
        if ind["value_json"].get("status") != "insufficient_data":
            assert ind["inputs"].get("transaction_ids"), f"{ind['code']} missing inputs"
