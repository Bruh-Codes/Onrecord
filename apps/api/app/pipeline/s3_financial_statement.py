"""Extract explicitly printed financial-statement line items.

Financial statements are not transaction ledgers. This parser therefore emits
only auditable field extractions and never derives a missing total or creates a
synthetic transaction.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class FinancialField:
    key: str
    label: str
    value_pesewas: int
    raw_value: str
    page: int = 1


_FIELD_ALIASES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("revenue", ("revenue", "sales", "turnover", "total income")),
    ("cost_of_sales", ("cost of sales", "cost of goods sold", "cost of goods")),
    ("gross_profit", ("gross profit",)),
    ("operating_expenses", ("operating expenses", "operating costs", "total expenses")),
    ("net_profit", ("net profit", "profit after tax", "profit for the year", "net income")),
    ("cash", ("cash and cash equivalents", "cash at bank", "cash")),
    ("total_assets", ("total assets",)),
    ("current_assets", ("current assets",)),
    ("total_liabilities", ("total liabilities",)),
    ("current_liabilities", ("current liabilities",)),
    ("equity", ("total equity", "shareholders' equity", "owner's equity", "equity")),
)
_AMOUNT_RE = re.compile(r"(?:GH[¢c]|GHS|₵)?\s*\(?-?\s*\d[\d,]*(?:\.\d{1,2})?\s*\)?", re.IGNORECASE)


def parse_financial_statement(text: str) -> tuple[list[FinancialField], str | None]:
    fields: list[FinancialField] = []
    seen: set[str] = set()
    for line in text.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        label = " ".join(cells[:1]).strip()
        for key, aliases in _FIELD_ALIASES:
            if key in seen or not any(re.search(rf"\b{re.escape(alias)}\b", label, re.I) for alias in aliases):
                continue
            value_match = _AMOUNT_RE.search(" ".join(cells[1:]) or line)
            if value_match is None:
                continue
            value = _to_pesewas(value_match.group(0))
            if value is None:
                continue
            fields.append(FinancialField(key, label, value, value_match.group(0)))
            seen.add(key)
    if fields:
        return fields, None
    return [], "No explicit financial-statement line items were found"


def _to_pesewas(raw: str) -> int | None:
    value = raw.replace(",", "").replace("GH¢", "").replace("GHS", "").replace("₵", "").strip()
    negative = value.startswith("-") or (value.startswith("(") and value.endswith(")"))
    value = value.strip("()")
    try:
        amount = Decimal(value)
    except InvalidOperation:
        return None
    if amount < 0 or amount.as_tuple().exponent < -2:
        return None
    cents = int(amount * 100)
    return -cents if negative else cents
