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


_DATE_PATTERNS = (
    "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
    "%d-%b-%Y", "%d %b %Y", "%d-%B-%Y", "%d %B %Y",
)
_DATE_RE = re.compile(
    r"(?<!\d)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|"
    r"\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|"
    r"\d{1,2}[ -](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[ -]\d{4})(?!\d)",
    re.IGNORECASE,
)
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
    descriptions = [cell for index, cell in enumerate(cells) if index != date_index and not _amount_value(cell)]
    description = " ".join(descriptions).strip()
    if not description:
        description = cells[1] if len(cells) > 1 else ""

    debit = _amount_for_headers(cells, header, ("debit", "withdraw", "outflow", "paid"))
    credit = _amount_for_headers(cells, header, ("credit", "deposit", "inflow", "received"))
    amount_column = _amount_for_headers(cells, header, ("amount", "value", "total"))
    transaction_type = _header_value(cells, header, ("trans. type", "transaction type", "type"))
    balance_before = _amount_for_headers(cells, header, ("bal before", "balance before", "opening balance"))
    balance_after = _amount_for_headers(cells, header, ("bal after", "balance after", "closing balance"))
    if debit is not None and debit > 0:
        direction, amount = "out", debit
    elif credit is not None and credit > 0:
        direction, amount = "in", credit
    else:
        candidates = [_amount_value(cell) for index, cell in enumerate(cells) if index != date_index]
        candidates = [value for value in candidates if value is not None]
        if amount_column is not None and amount_column > 0:
            amount = amount_column
            direction = _direction(transaction_type or description, balance_before, balance_after)
        elif not candidates:
            return None
        else:
            amount = candidates[0]
            direction = "out" if re.search(r"cash out|withdraw|debit|payment|purchase|airtime|bill pay|fee", description, re.I) else "in"

    balance = balance_after or _last_amount_for_headers(cells, header, ("balance", "running"))
    # MoMo exports contain many numeric identifiers (account, phone, F_ID).
    # If Docling shifts a cell while reconstructing the wide table, the amount
    # header can accidentally select one of those identifiers. For rows with
    # both balances, the movement is a safer recovery signal than an ID-sized
    # number. A generous multiplier preserves legitimate fee/levy differences.
    if balance_before is not None and balance_after is not None:
        movement = abs(balance_before - balance_after)
        if movement > 0 and amount > movement * 10:
            amount = movement
    return ParsedRow(occurred_on, description, direction, amount, balance)


def _amount_for_headers(cells: list[str], header: list[str], names: tuple[str, ...]) -> int | None:
    for index, title in enumerate(header):
        if index >= len(cells) or not any(name in title for name in names):
            continue
        value = _amount_value(cells[index])
        if value is not None:
            return value
    return None


def _last_amount_for_headers(cells: list[str], header: list[str], names: tuple[str, ...]) -> int | None:
    """Use the rightmost matching balance (useful for BAL BEFORE/BAL AFTER)."""
    for index in range(min(len(cells), len(header)) - 1, -1, -1):
        if any(name in header[index] for name in names):
            value = _amount_value(cells[index])
            if value is not None:
                return value
    return None


def _header_value(cells: list[str], header: list[str], names: tuple[str, ...]) -> str | None:
    for index, title in enumerate(header):
        if index < len(cells) and any(name in title for name in names):
            return cells[index]
    return None


def _direction(value: str, balance_before: int | None, balance_after: int | None) -> str:
    if re.search(r"debit|payment|purchase|withdraw|cash[ -]?out|airtime|bill|fee", value, re.I):
        return "out"
    if re.search(r"credit|deposit|cash[ -]?in|receive|refund", value, re.I):
        return "in"
    if balance_before is not None and balance_after is not None:
        return "out" if balance_after < balance_before else "in"
    return "in"


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
