"""Suggest which column means what, so the owner only has to confirm it.

Header words get it right for most bookkeeping sheets. The data under the
header is then checked: a "Date" column with no dates in it, or a money column
that holds unit prices, is not trusted. The sheet's own name and title rows
say whether a one-amount tab is costs or sales. The owner always confirms
before any row is read.
"""

import re
from datetime import date

from app.services.sheet_sync.parsing import (
    FIELDS,
    cell_text,
    normalise,
    parse_amount,
    parse_date,
)

SYNONYMS: dict[str, tuple[str, ...]] = {
    "date": ("date", "day", "when", "txn date", "transaction date", "date of transaction", "trans date", "value date"),
    "money_in": (
        "money in", "income", "in", "credit", "credits", "cr", "receipts", "received", "amount received", "sales",
        "inflow", "inflows", "revenue", "amount in", "deposit", "deposits", "cash in", "paid in",
    ),
    "money_out": (
        "money out", "expense", "expenses", "out", "debit", "debits", "dr", "payments", "paid", "spent",
        "outflow", "outflows", "cost", "costs", "amount out", "withdrawal", "withdrawals", "purchases",
        "cash out", "paid out", "amount paid", "expenditure",
    ),
    "amount": ("amount", "total", "value", "amount ghs", "amount gh", "ghs", "cedis", "price", "sum", "amt"),
    "direction": (
        "type", "in/out", "in out", "income/expense", "income expense", "transaction type", "dr/cr", "cr/dr",
        "kind", "flow", "entry type",
    ),
    "description": (
        "description", "details", "detail", "particulars", "narration", "item", "items", "what for", "notes",
        "note", "memo", "remarks", "purpose", "transaction", "narrative",
    ),
    "category": ("category", "categories", "class", "account", "head", "expense type", "income type", "group"),
    "counterparty": (
        "customer", "client", "supplier", "vendor", "paid to", "received from", "name", "payee", "party",
        "customer name", "supplier name", "from/to", "from to",
    ),
    "payment_method": ("method", "payment method", "mode", "paid by", "payment type", "channel", "payment mode", "via"),
    "reference": (
        "ref", "reference", "receipt no", "receipt number", "invoice no", "invoice number", "txn id",
        "transaction id", "voucher", "voucher no", "ref no",
    ),
    "product": ("product", "service", "product or service", "line", "crop", "business line", "enterprise"),
}
_HEADER_SCAN_ROWS = 15
_SAMPLE_ROWS = 40
_MONEY_FIELDS = ("money_in", "money_out", "amount")
# "Unit cost", "Qty", "Rate" and "Balance" hold numbers but not the record's amount.
_NOT_AMOUNT = re.compile(r"\b(unit|units|qty|quantity|rate|per|each|balance|bal|price per|no of|number of)\b")
_OUT_NAMES = re.compile(r"\b(expense|expenses|expenditure|cost|costs|spend|spending|purchase|purchases|payments|bills)\b")
_IN_NAMES = re.compile(r"\b(sale|sales|income|revenue|receipts|takings|earnings)\b")


def _header(value) -> str:
    return " ".join(normalise(cell_text(value)).split())


def _score(header: str, field: str) -> int:
    if field in _MONEY_FIELDS and _NOT_AMOUNT.search(header):
        return 0
    words = SYNONYMS[field]
    if header in words:
        return 3
    if any(len(word) > 3 and word in header for word in words):
        return 1
    return 0


def find_header_row(rows: list[list]) -> int:
    """1-based row number of the most header-like row near the top, or 0."""
    best_row, best_hits = 0, 1
    for index, values in enumerate(rows[:_HEADER_SCAN_ROWS]):
        headers = [_header(value) for value in values]
        hits = sum(1 for header in headers if header and any(_score(header, field) for field in FIELDS))
        if hits > best_hits:
            best_row, best_hits = index + 1, hits
    return best_row


def propose_mapping(rows: list[list], *, today: date | None = None, names: tuple[str, ...] = ()) -> dict:
    """A best guess the owner will confirm. Never applied without that.

    names are the spreadsheet and tab names, which often say "Expenses" or "Sales".
    """
    header_row = find_header_row(rows)
    headers = [_header(value) for value in rows[header_row - 1]] if header_row else []
    candidates = sorted(
        ((_score(header, field), -FIELDS.index(field), index, field)
         for index, header in enumerate(headers) if header for field in FIELDS),
        reverse=True,
    )
    columns: dict[str, int | None] = {field: None for field in FIELDS}
    used: set[int] = set()
    for score, _, index, field in candidates:
        if score == 0 or index in used or columns[field] is not None:
            continue
        columns[field] = index
        used.add(index)

    # One amount column or money in and out, never a mix of the two.
    split = [field for field in ("money_in", "money_out") if columns[field] is not None]
    if columns["amount"] is not None and len(split) == 2:
        used.discard(columns["amount"])
        columns["amount"] = None
    elif columns["amount"] is not None and len(split) == 1:
        used.discard(columns[split[0]])
        columns[split[0]] = None

    sample = [row for row in rows[header_row:header_row + _SAMPLE_ROWS] if any(cell_text(cell) for cell in row)]

    def is_date(value) -> bool:
        return parse_date(value, today=today) is not None

    if columns["date"] is not None and not _mostly(sample, columns["date"], is_date):
        # A "Date" header over an empty or unreadable column: look for dates elsewhere.
        found = _column_where(sample, is_date, exclude=used)
        if found is not None:
            used.discard(columns["date"])
            columns["date"] = found
            used.add(found)
    if columns["date"] is None:
        columns["date"] = _column_where(sample, is_date, exclude=used)
        if columns["date"] is not None:
            used.add(columns["date"])
    if columns["amount"] is None and columns["money_in"] is None and columns["money_out"] is None:
        columns["amount"] = _column_where(sample, lambda value: parse_amount(value) is not None, exclude=used)

    return {
        "header_row": header_row,
        "columns": columns,
        "default_direction": _guess_direction(rows[:header_row], sample, columns, names),
        "date_order": _guess_date_order(sample, columns["date"]),
        "default_date": None,
        "source": "headers",
    }


def _mostly(sample: list[list], index: int, test) -> bool:
    cells = [row[index] for row in sample if index < len(row) and cell_text(row[index])]
    return bool(cells) and sum(1 for cell in cells if test(cell)) / len(cells) >= 0.6


def _guess_direction(title_rows: list[list], sample: list[list], columns: dict, names: tuple[str, ...]) -> str | None:
    """For a one-amount tab with no in/out column: is it a costs tab or a sales tab?"""
    if columns["amount"] is None or columns["direction"] is not None:
        return None
    amounts = [parse_amount(row[columns["amount"]]) for row in sample if columns["amount"] < len(row)]
    if any(amount is not None and amount < 0 for amount in amounts):
        return None  # Minus signs already say which rows are money out.
    text = " ".join([*names, *(cell_text(cell) for row in title_rows for cell in row)])
    words = " ".join(normalise(text).split())
    out, into = bool(_OUT_NAMES.search(words)), bool(_IN_NAMES.search(words))
    if out and not into:
        return "out"
    if into and not out:
        return "in"
    return None


def _guess_date_order(sample: list[list], index: int | None) -> str:
    """31/10 can only be day first and 10/31 only month first. Day first otherwise (Ghana)."""
    if index is None:
        return "dmy"
    day_first = month_first = 0
    for row in sample:
        match = re.match(r"^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}\s*$", cell_text(row[index]) if index < len(row) else "")
        if not match:
            continue
        first, second = int(match.group(1)), int(match.group(2))
        day_first += first > 12
        month_first += second > 12
    return "mdy" if month_first > day_first else "dmy"


def _column_where(sample: list[list], test, *, exclude: set) -> int | None:
    width = max((len(row) for row in sample), default=0)
    for index in range(width):
        if index in exclude:
            continue
        cells = [row[index] for row in sample if index < len(row) and cell_text(row[index])]
        if len(cells) >= 3 and sum(1 for cell in cells if test(cell)) / len(cells) >= 0.6:
            return index
    return None


FIELD_NAMES = {
    "date": "date", "money_in": "money in", "money_out": "money out", "amount": "amount",
    "direction": "in or out", "description": "details", "category": "category",
    "counterparty": "customer or supplier", "payment_method": "paid by", "reference": "reference",
    "product": "product or service",
}


def field_problems(mapping: dict, width: int) -> list[dict]:
    """What stops a mapping from being usable, each tied to the question it belongs to."""
    columns = mapping.get("columns") or {}
    problems: list[dict] = []

    def add(field: str, message: str) -> None:
        problems.append({"field": field, "message": message})

    for field, index in columns.items():
        if field not in FIELDS:
            add("columns", f"Unknown field {field}.")
        elif index is not None and not (0 <= index < max(width, 1)):
            add(field, f"The column for {FIELD_NAMES[field]} is outside the sheet.")
    if columns.get("date") is None and not mapping.get("default_date"):
        add("date", "Choose the column with the date, or pick one date for every row.")
    has_split = columns.get("money_in") is not None or columns.get("money_out") is not None
    if not has_split and columns.get("amount") is None:
        add("amount", "Choose the column with the amount, or the money in and money out columns.")
    if has_split and columns.get("amount") is not None:
        add("amount", "Use either one amount column or money in and money out columns, not both.")
    if mapping.get("default_direction") not in (None, "in", "out"):
        add("direction", "All-rows direction must be money in or money out.")
    if mapping.get("date_order", "dmy") not in ("dmy", "mdy"):
        add("date", "Date order must be day first or month first.")
    seen: dict[int, str] = {}
    for field, index in columns.items():
        if index is None or field not in FIELDS:
            continue
        if index in seen:
            add(field, f"This column is already used for {FIELD_NAMES[seen[index]]}.")
        else:
            seen[index] = field
    return problems


def mapping_problems(mapping: dict, width: int) -> list[str]:
    """The same problems as plain sentences."""
    return [problem["message"] for problem in field_problems(mapping, width)]
