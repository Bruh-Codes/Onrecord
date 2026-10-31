"""Turn spreadsheet cells into records, using the owner's confirmed column mapping.

Cells arrive from the Sheets API as UNFORMATTED_VALUE with dates as serial
numbers, so most amounts are already numbers. Typed-in text such as
"GH₵ 1,200.00" or "3 Oct" is still common and handled here.
"""

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

# A mapping is {"header_row": 1-based int, "columns": {field: 0-based index},
# "default_direction": "in" | "out" | None, "date_order": "dmy" | "mdy"}.
FIELDS = (
    "date", "money_in", "money_out", "amount", "direction", "description",
    "category", "counterparty", "payment_method", "reference", "product",
)

IN_WORDS = {
    "in", "income", "credit", "cr", "sale", "sales", "sold", "received", "receipt", "receipts",
    "deposit", "inflow", "revenue", "money in", "+", "earning", "earnings",
}
OUT_WORDS = {
    "out", "expense", "expenses", "debit", "dr", "purchase", "purchases", "payment", "paid",
    "spent", "spend", "withdrawal", "outflow", "cost", "costs", "money out", "-", "bought",
}
_SKIP_WORDS = ("total", "sub total", "subtotal", "balance b/f", "balance c/f", "brought forward", "carried forward")
_TOTAL_CELLS = {"total", "totals", "grand total", "sub total", "subtotal", "balance b/f", "balance c/f", "bal b/f", "bal c/f"}
_CURRENCY = re.compile(r"(?i)gh[s₵¢c]?|ghs|cedis?|¢|₵")
_ORDINAL = re.compile(r"(?<=\d)(st|nd|rd|th)\b", re.IGNORECASE)
_EXCEL_EPOCH = date(1899, 12, 30)

_DMY_FORMATS = (
    "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y", "%d.%m.%y",
)
_MDY_FORMATS = (
    "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y", "%m.%d.%Y", "%m.%d.%y",
)
_OTHER_FORMATS = (
    "%Y-%m-%d", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%b-%y", "%d %b %y",
    "%d %B %y", "%b %d %Y", "%B %d %Y", "%b %d, %Y", "%B %d, %Y", "%d %b, %Y", "%d %B, %Y",
)
_NO_YEAR_FORMATS = ("%d %b", "%d %B", "%d-%b", "%b %d", "%B %d")


@dataclass
class ParsedRow:
    row_number: int
    values: list
    fingerprint: str = ""
    record: dict | None = None
    issues: list[str] = field(default_factory=list)
    skip: bool = False

    def as_json(self) -> dict:
        return asdict(self)


def cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return " ".join(str(value).split())


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9/+\- ]+", " ", text.lower()).strip()


def parse_amount(value) -> int | None:
    """Signed pesewas, or None when the cell holds no readable amount (INV-1)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            amount = Decimal(str(value))
        except InvalidOperation:
            return None
        return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    text = cell_text(value)
    if not text:
        return None
    negative = text.startswith("-") or (text.startswith("(") and text.endswith(")"))
    cleaned = _CURRENCY.sub("", text).replace(",", "").replace(" ", "").strip("()").strip("+-").strip()
    if not re.fullmatch(r"\d+(\.\d+)?", cleaned):
        return None
    pesewas = int((Decimal(cleaned) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return -pesewas if negative else pesewas


def parse_date(value, *, date_order: str = "dmy", today: date | None = None) -> date | None:
    today = today or date.today()
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        # Sheets serial date: days since 1899-12-30. 36526 is 2000-01-01.
        if 36526 <= value <= 73051:
            return _EXCEL_EPOCH + timedelta(days=int(value))
        return None
    text = _ORDINAL.sub("", cell_text(value)).strip()
    if not text:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}T", text):
        text = text[:10]
    ordered = _MDY_FORMATS + _DMY_FORMATS if date_order == "mdy" else _DMY_FORMATS + _MDY_FORMATS
    for fmt in (*ordered, *_OTHER_FORMATS):
        try:
            parsed = datetime.strptime(text, fmt).date()
        except ValueError:
            continue
        return parsed if 2000 <= parsed.year <= today.year + 1 else None
    for fmt in _NO_YEAR_FORMATS:
        try:
            parsed = datetime.strptime(f"{text} {today.year}", f"{fmt} %Y").date()
        except ValueError:
            continue
        # "3 Dec" typed in January means last December.
        return parsed.replace(year=today.year - 1) if parsed > today + timedelta(days=31) else parsed
    return None


def parse_direction(value) -> str | None:
    text = normalise(cell_text(value))
    if not text:
        return None
    if text in IN_WORDS:
        return "in"
    if text in OUT_WORDS:
        return "out"
    words = set(text.split())
    if words & IN_WORDS and not words & OUT_WORDS:
        return "in"
    if words & OUT_WORDS and not words & IN_WORDS:
        return "out"
    return None


def _cell(values: list, index: int | None):
    if index is None or index < 0 or index >= len(values):
        return None
    return values[index]


def _text(values: list, index: int | None) -> str | None:
    text = cell_text(_cell(values, index))
    return text[:300] or None


def parse_row(values: list, row_number: int, mapping: dict, *, today: date | None = None) -> ParsedRow:
    """Read one sheet row. Blank and total rows are skipped, not reported."""
    today = today or date.today()
    columns = mapping.get("columns", {})
    row = ParsedRow(row_number=row_number, values=[cell_text(value) for value in values])
    if not any(row.values):
        row.skip = True
        return row

    occurred_on = parse_date(_cell(values, columns.get("date")), date_order=mapping.get("date_order", "dmy"), today=today)
    direction, amount, issues = _money(values, columns, mapping.get("default_direction"))
    text_cells = " ".join(row.values).lower()
    if any(normalise(value) in _TOTAL_CELLS for value in row.values):
        row.skip = True
        return row
    if occurred_on is None and (amount is None or any(word in text_cells for word in _SKIP_WORDS)):
        row.skip = True
        return row
    if occurred_on is None:
        issues.insert(0, "The date could not be read.")
    elif occurred_on > today + timedelta(days=31):
        issues.insert(0, "The date is in the future.")
    if amount is None and not issues:
        issues.append("No amount was found.")
    if amount == 0:
        row.skip = True
        return row

    row.issues = issues
    if not issues:
        row.record = {
            "occurred_on": occurred_on.isoformat(),
            "direction": direction,
            "amount_pesewas": amount,
            "description": _text(values, columns.get("description")),
            "category_text": _text(values, columns.get("category")),
            "counterparty": _text(values, columns.get("counterparty")),
            "payment_method": _text(values, columns.get("payment_method")),
            "reference": _text(values, columns.get("reference")),
            "product": _text(values, columns.get("product")),
        }
    row.fingerprint = fingerprint(row)
    return row


def _money(values: list, columns: dict, default_direction: str | None) -> tuple[str | None, int | None, list[str]]:
    if columns.get("money_in") is not None or columns.get("money_out") is not None:
        money_in = parse_amount(_cell(values, columns.get("money_in")))
        money_out = parse_amount(_cell(values, columns.get("money_out")))
        filled = [(name, abs(amount)) for name, amount in (("in", money_in), ("out", money_out)) if amount]
        if len(filled) == 2:
            return None, None, ["Both money in and money out are filled in."]
        if not filled:
            return None, (0 if money_in == 0 or money_out == 0 else None), []
        return filled[0][0], filled[0][1], []

    amount = parse_amount(_cell(values, columns.get("amount")))
    if amount is None or amount == 0:
        return None, amount, []
    direction = parse_direction(_cell(values, columns.get("direction"))) if columns.get("direction") is not None else None
    if direction is None and amount < 0:
        direction = "out"
    if direction is None:
        direction = default_direction
    if direction is None:
        return None, None, ["It isn't clear whether this is money in or money out."]
    return direction, abs(amount), []


def fingerprint(row: ParsedRow) -> str:
    """Identify a row by what it says, not where it sits, so sorting is harmless."""
    if row.record:
        record = row.record
        parts = [
            record["occurred_on"], record["direction"], str(record["amount_pesewas"]),
            *(normalise(record.get(key) or "") for key in ("description", "category_text", "counterparty", "reference", "product")),
        ]
        key = "rec|" + "|".join(parts)
    else:
        key = "raw|" + json.dumps([normalise(value) for value in row.values])
    return hashlib.sha256(key.encode()).hexdigest()


def parse_rows(rows: list[list], mapping: dict, *, today: date | None = None) -> list[ParsedRow]:
    """Every row below the header that holds something."""
    header_row = int(mapping.get("header_row") or 0)
    parsed = []
    for index, values in enumerate(rows):
        row_number = index + 1
        if row_number <= header_row:
            continue
        row = parse_row(values, row_number, mapping, today=today)
        if not row.skip:
            parsed.append(row)
    return parsed


def header_signature(rows: list[list], mapping: dict) -> dict[str, str]:
    """The header text over each mapped column, to notice when the layout changes."""
    header_row = int(mapping.get("header_row") or 0)
    if header_row < 1 or header_row > len(rows):
        return {}
    header = rows[header_row - 1]
    return {
        name: normalise(cell_text(_cell(header, index)))
        for name, index in mapping.get("columns", {}).items()
        if index is not None
    }
