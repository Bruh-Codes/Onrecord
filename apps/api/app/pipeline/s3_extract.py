"""Conservative extraction of transaction tables exported by Docling.

This is intentionally parser-first: rows are accepted only when a date and a
clear amount/direction are present. Ambiguous documents remain classified for
review instead of creating plausible-looking financial data.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class ParsedRow:
    occurred_on: date
    description: str
    direction: str
    amount_pesewas: int
    balance_after_pesewas: int | None
    page: int = 1


_DATE_PATTERNS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y")
_DATE_RE = re.compile(r"(?<!\d)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?!\d)")
_AMOUNT_RE = re.compile(r"[-+]?\(?\s*(?:GH[¢c]|GHS|₵)?\s*[-+]?\d[\d,]*(?:\.\d{1,2})?\s*\)?", re.IGNORECASE)


def parse_statement(text: str) -> tuple[list[ParsedRow], str | None]:
    """Parse markdown tables with date/description/debit/credit columns."""
    lines = [line.strip() for line in text.splitlines() if "|" in line]
    rows: list[ParsedRow] = []
    for index, line in enumerate(lines):
        cells = _cells(line)
        if not cells or _is_separator(cells) or not any(_looks_like_date(cell) for cell in cells):
            continue
        header = _nearest_header(lines, index)
        parsed = _parse_row(cells, header)
        if parsed is not None:
            rows.append(parsed)
    if rows:
        return rows, None
    return [], "No unambiguous transaction table was found"


def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_separator(cells: list[str]) -> bool:
    return all(re.fullmatch(r":?-{2,}:?", cell.replace(" ", "")) for cell in cells)


def _nearest_header(lines: list[str], index: int) -> list[str]:
    for candidate in reversed(lines[max(0, index - 4) : index]):
        cells = _cells(candidate)
        if any(re.search(r"date|description|debit|credit|withdraw|deposit|amount|balance", c, re.I) for c in cells):
            return [c.lower() for c in cells]
    return []


def _parse_row(cells: list[str], header: list[str]) -> ParsedRow | None:
    date_index = next((index for index, cell in enumerate(cells) if _looks_like_date(cell)), None)
    if date_index is None:
        return None
    occurred_on = _parse_date(cells[date_index])
    if occurred_on is None:
        return None
    descriptions = [
        cell for index, cell in enumerate(cells) if index != date_index and not _amount_value(cell)
    ]
    description = " ".join(descriptions).strip()
    if not description:
        description = cells[1] if len(cells) > 1 else ""

    debit = _amount_for_headers(cells, header, ("debit", "withdraw", "outflow", "paid"))
    credit = _amount_for_headers(cells, header, ("credit", "deposit", "inflow", "received"))
    if debit is not None and debit > 0:
        direction, amount = "out", debit
    elif credit is not None and credit > 0:
        direction, amount = "in", credit
    else:
        amount_column = _amount_for_headers(cells, header, ("amount", "value", "total"))
        candidates = [_amount_value(cell) for index, cell in enumerate(cells) if index != date_index]
        candidates = [value for value in candidates if value is not None]
        if amount_column is not None and amount_column > 0:
            amount = amount_column
            direction = "out" if re.search(r"cash out|withdraw|debit|payment|purchase|airtime|bill pay|fee", description, re.I) else "in"
        elif not candidates:
            return None
        else:
            amount = candidates[0]
            direction = "out" if re.search(r"cash out|withdraw|debit|payment|purchase|airtime|bill pay|fee", description, re.I) else "in"

    balance = _amount_for_headers(cells, header, ("balance", "running"))
    return ParsedRow(occurred_on, description, direction, amount, balance)


def _amount_for_headers(cells: list[str], header: list[str], names: tuple[str, ...]) -> int | None:
    for index, title in enumerate(header):
        if index >= len(cells) or not any(name in title for name in names):
            continue
        value = _amount_value(cells[index])
        if value is not None:
            return value
    return None


def _amount_value(value: str) -> int | None:
    match = _AMOUNT_RE.search(value.replace(" ", ""))
    if match is None:
        return None
    raw = match.group(0).replace(",", "").replace("GH¢", "").replace("GHS", "").replace("₵", "")
    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    raw = raw.strip("()")
    try:
        amount = Decimal(raw.lstrip("+"))
    except InvalidOperation:
        return None
    if amount < 0 or amount.as_tuple().exponent < -2:
        return None
    return int(amount * 100) if not negative else int(abs(amount) * 100)


def _looks_like_date(value: str) -> bool:
    return _parse_date(value) is not None


def _parse_date(value: str) -> date | None:
    match = _DATE_RE.search(value)
    if match is None:
        return None
    candidate = match.group(1).replace(".", "/")
    for pattern in _DATE_PATTERNS:
        try:
            return datetime.strptime(candidate, pattern).date()
        except ValueError:
            continue
    return None
