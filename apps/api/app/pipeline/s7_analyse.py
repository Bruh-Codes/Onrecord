"""S7 Analytics — the computable indicators (specs/05-analytics.md).

Pure and deterministic. No LLM, no network. Same inputs + FORMULA_VERSION
must give byte-identical output. Money is integer pesewas throughout.

This module implements the indicator subset that is robust before heavy
customisation (S6). Every indicator still writes its `inputs` (INV-7).
"""

import uuid
from dataclasses import dataclass, field
from datetime import date

FORMULA_VERSION = "1.0.0"

OPERATING_OUTFLOW = {"cogs", "opex", "tax"}


@dataclass
class Txn:
    """The minimal transaction shape the indicators need."""

    id: uuid.UUID
    account_id: uuid.UUID
    occurred_on: date
    direction: str
    amount_pesewas: int
    category_l1: str | None
    category_l2: str | None
    balance_after_pesewas: int | None
    flags: dict = field(default_factory=dict)


@dataclass
class AnalysisContext:
    business_id: uuid.UUID
    window_start: date
    window_end: date
    txns: list[Txn] = field(default_factory=list)


def filter_transactions(txns: list[Txn], window_start: date, window_end: date) -> list[Txn]:
    """Exclude dupes, internal transfers, fx and reversals; drop rows outside the
    window (specs/05-analytics.md §2). Unknown stays — UNCLASSIFIED_RATIO needs it."""
    kept: list[Txn] = []
    for t in txns:
        if t.flags.get("duplicate") or t.flags.get("internal_transfer") or t.flags.get("fx") or t.flags.get("reversal"):
            continue
        if t.occurred_on < window_start or t.occurred_on > window_end:
            continue
        kept.append(t)
    return kept


def _month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _month_keys(start: date, end: date) -> list[str]:
    keys: list[str] = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        keys.append(_month_key(cursor))
        year, month = cursor.year, cursor.month
        cursor = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return keys


def _in_month(t: Txn, month: str) -> bool:
    return _month_key(t.occurred_on) == month


def _series(txns: list[Txn], start: date, end: date, condition) -> list[dict]:
    months = _month_keys(start, end)
    return [
        {"m": m, "v": sum(t.amount_pesewas for t in txns if _in_month(t, m) and condition(t))}
        for m in months
    ]


def _inputs(txns: list[Txn]) -> dict:
    return {"transaction_ids": [str(t.id) for t in txns]}


def _insufficient(code: str, unit: str, reason: str) -> dict:
    return {"code": code, "unit": unit, "value_json": {"status": "insufficient_data", "reason": reason}, "inputs": {}, "formula_version": FORMULA_VERSION}


def _rev(txns: list[Txn]) -> list[Txn]:
    return [t for t in txns if t.direction == "in" and t.category_l1 == "revenue"]


def _exp(txns: list[Txn]) -> list[Txn]:
    return [t for t in txns if t.direction == "out" and t.category_l1 in OPERATING_OUTFLOW]


def compute_indicators(ctx: AnalysisContext) -> list[dict]:
    """Returns indicator payloads: {code, unit, value_json, inputs, formula_version}."""
    txns = filter_transactions(ctx.txns, ctx.window_start, ctx.window_end)

    out: list[dict] = [
        _monthly_revenue(txns, ctx),
        _revenue_ttm(txns, ctx),
        _opex_ratio(txns, ctx),
        _operating_cashflow(txns, ctx),
        _net_cashflow(txns, ctx),
        _unclassified_ratio(txns, ctx),
        _existing_debt_service(txns, ctx),
        _negative_balance_days(txns, ctx),
        _positive_balance_days(txns, ctx),
        _active_trading_days(txns, ctx),
        _avg_ticket(txns, ctx),
        _revenue_growth(txns, ctx),
    ]
    return [r for r in out if r is not None]


def _monthly_revenue(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = _rev(txns)
    if not rev:
        return _insufficient("REV_MONTHLY", "pesewas", "no revenue transactions in window")
    series = _series(rev, ctx.window_start, ctx.window_end, lambda t: True)
    return {"code": "REV_MONTHLY", "unit": "pesewas", "value_json": {"series": series}, "inputs": _inputs(rev), "formula_version": FORMULA_VERSION}


def _revenue_ttm(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = _rev(txns)
    if not rev:
        return _insufficient("REV_TTM", "pesewas", "no revenue transactions in window")
    total = sum(t.amount_pesewas for t in rev)
    return {"code": "REV_TTM", "unit": "pesewas", "value_json": {"v": total}, "inputs": _inputs(rev), "formula_version": FORMULA_VERSION}


def _revenue_growth(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = _rev(txns)
    months = sorted({_month_key(t.occurred_on) for t in rev})
    if len(months) < 6:
        return _insufficient("REV_GROWTH_3M", "ratio", "requires 6 revenue months, have fewer")
    first_three = set(months[-6:-3])
    last_three = set(months[-3:])
    sum_first = sum(t.amount_pesewas for t in rev if _month_key(t.occurred_on) in first_three)
    sum_last = sum(t.amount_pesewas for t in rev if _month_key(t.occurred_on) in last_three)
    if sum_first == 0:
        return _insufficient("REV_GROWTH_3M", "ratio", "prior 3-month revenue is zero")
    return {"code": "REV_GROWTH_3M", "unit": "ratio", "value_json": {"v": round((sum_last - sum_first) / sum_first, 4)}, "inputs": _inputs(rev), "formula_version": FORMULA_VERSION}


def _active_trading_days(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = _rev(txns)
    if not rev:
        return _insufficient("ACTIVE_TRADING_DAYS", "count", "no revenue transactions in window")
    series: list[dict] = []
    for m in _month_keys(ctx.window_start, ctx.window_end):
        days = {t.occurred_on for t in rev if _in_month(t, m)}
        series.append({"m": m, "v": len(days)})
    return {"code": "ACTIVE_TRADING_DAYS", "unit": "count", "value_json": {"series": series}, "inputs": _inputs(rev), "formula_version": FORMULA_VERSION}


def _avg_ticket(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = _rev(txns)
    if not rev:
        return _insufficient("AVG_TICKET", "pesewas", "no revenue transactions in window")
    series: list[dict] = []
    for m in _month_keys(ctx.window_start, ctx.window_end):
        month_txns = [t for t in rev if _in_month(t, m)]
        n = len(month_txns)
        avg = round(sum(t.amount_pesewas for t in month_txns) / n) if n else 0
        series.append({"m": m, "v": avg})
    return {"code": "AVG_TICKET", "unit": "pesewas", "value_json": {"series": series}, "inputs": _inputs(rev), "formula_version": FORMULA_VERSION}


def _opex_ratio(txns: list[Txn], ctx: AnalysisContext) -> dict:
    total_rev = sum(t.amount_pesewas for t in _rev(txns))
    total_exp = sum(t.amount_pesewas for t in _exp(txns))
    if total_rev == 0:
        return _insufficient("OPEX_RATIO", "ratio", "no revenue in window")
    return {"code": "OPEX_RATIO", "unit": "ratio", "value_json": {"v": round(total_exp / total_rev, 4)}, "inputs": _inputs(txns), "formula_version": FORMULA_VERSION}


def _operating_cashflow(txns: list[Txn], ctx: AnalysisContext) -> dict:
    values: dict[str, int] = {}
    for t in txns:
        m = _month_key(t.occurred_on)
        values.setdefault(m, 0)
        if t.direction == "in" and t.category_l1 == "revenue":
            values[m] += t.amount_pesewas
        elif t.direction == "out" and t.category_l1 in OPERATING_OUTFLOW:
            values[m] -= t.amount_pesewas
    series = [{"m": m, "v": v} for m, v in sorted(values.items())]
    return {"code": "OPERATING_CASHFLOW", "unit": "pesewas", "value_json": {"series": series}, "inputs": _inputs(txns), "formula_version": FORMULA_VERSION}


def _net_cashflow(txns: list[Txn], ctx: AnalysisContext) -> dict:
    values: dict[str, int] = {}
    for t in txns:
        m = _month_key(t.occurred_on)
        values.setdefault(m, 0)
        if t.direction == "in":
            values[m] += t.amount_pesewas
        else:
            values[m] -= t.amount_pesewas
    series = [{"m": m, "v": v} for m, v in sorted(values.items())]
    return {"code": "NET_CASHFLOW", "unit": "pesewas", "value_json": {"series": series}, "inputs": _inputs(txns), "formula_version": FORMULA_VERSION}


def _unclassified_ratio(txns: list[Txn], ctx: AnalysisContext) -> dict:
    total = sum(t.amount_pesewas for t in txns)
    unknown = sum(t.amount_pesewas for t in txns if t.category_l1 in (None, "unknown"))
    if total == 0:
        return _insufficient("UNCLASSIFIED_RATIO", "ratio", "no transactions in window")
    return {"code": "UNCLASSIFIED_RATIO", "unit": "ratio", "value_json": {"v": round(unknown / total, 4)}, "inputs": _inputs(txns), "formula_version": FORMULA_VERSION}


def _existing_debt_service(txns: list[Txn], ctx: AnalysisContext) -> dict:
    rev = sum(t.amount_pesewas for t in _rev(txns))
    fin_out = sum(t.amount_pesewas for t in txns if t.direction == "out" and t.category_l1 == "financing_out")
    if rev == 0:
        return _insufficient("EXISTING_DEBT_SERVICE", "ratio", "no revenue in window")
    return {"code": "EXISTING_DEBT_SERVICE", "unit": "ratio", "value_json": {"v": round(fin_out / rev, 4)}, "inputs": _inputs(txns), "formula_version": FORMULA_VERSION}


def _negative_balance_days(txns: list[Txn], ctx: AnalysisContext) -> dict:
    with_balance = [t for t in txns if t.balance_after_pesewas is not None]
    if not with_balance:
        return _insufficient("NEGATIVE_BALANCE_DAYS", "count", "no transactions carry balance_after_pesewas")
    negative = sum(1 for t in with_balance if t.balance_after_pesewas <= 0)
    return {"code": "NEGATIVE_BALANCE_DAYS", "unit": "count", "value_json": {"v": negative}, "inputs": _inputs(with_balance), "formula_version": FORMULA_VERSION}


def _positive_balance_days(txns: list[Txn], ctx: AnalysisContext) -> dict:
    """Distinct days where any account had a positive end-of-day balance —
    a lightweight proxy for AVG_DAILY_BALANCE when balances exist."""
    with_balance = [t for t in txns if t.balance_after_pesewas is not None]
    if not with_balance:
        return _insufficient("POSITIVE_BALANCE_DAYS", "count", "no transactions carry balance_after_pesewas")
    by_day: dict[date, list[int]] = {}
    for t in with_balance:
        by_day.setdefault(t.occurred_on, []).append(t.balance_after_pesewas)
    positive = sum(1 for balances in by_day.values() if max(balances) > 0)
    return {"code": "POSITIVE_BALANCE_DAYS", "unit": "count", "value_json": {"v": positive}, "inputs": _inputs(with_balance), "formula_version": FORMULA_VERSION}