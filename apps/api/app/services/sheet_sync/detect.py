"""Suggest which column means what, so the owner only has to confirm it.

Header words get it right for most bookkeeping sheets. When they don't find a
date and an amount, the AI is asked (if one is configured), and failing that
the data itself is inspected. The owner always confirms before any row is read.
"""

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


def _score(header: str, field: str) -> int:
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
        headers = [normalise(cell_text(value)) for value in values]
        hits = sum(1 for header in headers if header and any(_score(header, field) for field in FIELDS))
        if hits > best_hits:
            best_row, best_hits = index + 1, hits
    return best_row


def propose_mapping(rows: list[list], *, today: date | None = None) -> dict:
    """A best guess the owner will confirm. Never applied without that."""
    header_row = find_header_row(rows)
    headers = [normalise(cell_text(value)) for value in rows[header_row - 1]] if header_row else []
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

    if columns["money_in"] is not None or columns["money_out"] is not None:
        if columns["amount"] is not None and columns["money_in"] is not None and columns["money_out"] is not None:
            columns["amount"] = None
    sample = rows[header_row:header_row + _SAMPLE_ROWS]
    if columns["date"] is None:
        columns["date"] = _column_where(sample, lambda value: parse_date(value, today=today) is not None, exclude=used)
    if columns["amount"] is None and columns["money_in"] is None and columns["money_out"] is None:
        columns["amount"] = _column_where(
            sample, lambda value: parse_amount(value) is not None, exclude=used | {columns["date"]},
        )
    return {
        "header_row": header_row,
        "columns": columns,
        "default_direction": None,
        "date_order": "dmy",
        "source": "headers",
    }


def _column_where(sample: list[list], test, *, exclude: set) -> int | None:
    width = max((len(row) for row in sample), default=0)
    for index in range(width):
        if index in exclude:
            continue
        cells = [row[index] for row in sample if index < len(row) and cell_text(row[index])]
        if len(cells) >= 3 and sum(1 for cell in cells if test(cell)) / len(cells) >= 0.6:
            return index
    return None


def mapping_problems(mapping: dict, width: int) -> list[str]:
    """What stops a mapping from being usable, in words for the owner."""
    columns = mapping.get("columns") or {}
    problems = []
    for field, index in columns.items():
        if field not in FIELDS:
            problems.append(f"Unknown field {field}.")
        elif index is not None and not (0 <= index < max(width, 1)):
            problems.append(f"The column for {field.replace('_', ' ')} is outside the sheet.")
    if columns.get("date") is None:
        problems.append("Choose the column with the date.")
    has_split = columns.get("money_in") is not None or columns.get("money_out") is not None
    if not has_split and columns.get("amount") is None:
        problems.append("Choose the column with the amount, or the money in and money out columns.")
    if has_split and columns.get("amount") is not None:
        problems.append("Use either one amount column or money in and money out columns, not both.")
    if mapping.get("default_direction") not in (None, "in", "out"):
        problems.append("All-rows direction must be money in or money out.")
    if mapping.get("date_order", "dmy") not in ("dmy", "mdy"):
        problems.append("Date order must be day first or month first.")
    used = [index for index in columns.values() if index is not None]
    if len(used) != len(set(used)):
        problems.append("One column is used for two things.")
    return problems
