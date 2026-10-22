"""Deterministic checks on Claude's document reading.

The reader transcribes; this module owns every number. Amounts are parsed
from the printed text into integer pesewas (INV-1), identifiers are masked
(Agent.md §5), and running balances are reconciled (INV-6) so a bad read or a
doctored statement is caught before it reaches the ledger.
"""

import re
from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from app.services.document_reader import DocumentReading, ReadRow

# Vision reads get the ±100 pesewas tolerance INV-6 allows for non-parser extraction.
BALANCE_TOLERANCE_PESEWAS = 100
_CURRENCY_RE = re.compile(r"(GH[S¢C₵]?|GHS|₵|¢|CEDIS?)", re.IGNORECASE)
_IDENTIFIER_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s-]{7,}\d)(?!\d)")


@dataclass(frozen=True)
class NormalizedRow:
    occurred_on: date
    description: str
    counterparty: str | None
    reference: str | None
    direction: str
    amount_pesewas: int
    fee_pesewas: int
    levy_pesewas: int
    balance_after_pesewas: int | None
    category_l1: str
    page: int
    source_ref: str

    def as_json(self) -> dict:
        return {**asdict(self), "occurred_on": self.occurred_on.isoformat()}

    @classmethod
    def from_json(cls, value: dict) -> "NormalizedRow":
        return cls(**{**value, "occurred_on": date.fromisoformat(value["occurred_on"])})


@dataclass(frozen=True)
class Reconciliation:
    status: str  # "reconciled" | "balance_breaks" | "unverifiable"
    rows_with_balance: int
    balance_breaks: int
    opening_closing_matches: bool | None
    note: str

    def as_json(self) -> dict:
        return asdict(self)


def to_pesewas(text: str | None) -> int | None:
    """Parse a printed amount ("GHS 1,250.00", "(50.00)", "1 200") into positive pesewas."""
    if text is None:
        return None
    cleaned = _CURRENCY_RE.sub("", text).replace(",", "").replace(" ", "").strip()
    cleaned = cleaned.strip("()").lstrip("+-").rstrip("-").strip()
    if cleaned.upper().endswith(("CR", "DR")):
        cleaned = cleaned[:-2]
    if not cleaned or not re.fullmatch(r"\d+(\.\d{1,2})?", cleaned):
        return None
    try:
        return int(Decimal(cleaned) * 100)
    except InvalidOperation:
        return None


def mask_identifiers(text: str | None) -> str | None:
    """Mask phone and account numbers to their last 3 digits."""
    if text is None:
        return None

    def _mask(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        return f"•••{digits[-3:]}" if len(digits) >= 9 else match.group(0)

    return _IDENTIFIER_RE.sub(_mask, text)


def normalize_rows(reading: DocumentReading) -> tuple[list[NormalizedRow], int]:
    """Return usable rows and the number of rows that could not be parsed."""
    rows: list[NormalizedRow] = []
    rejected = 0
    for row in reading.rows:
        normalized = _normalize(row)
        if normalized is None:
            rejected += 1
        else:
            rows.append(normalized)
    return rows, rejected


def _normalize(row: ReadRow) -> NormalizedRow | None:
    try:
        occurred_on = date.fromisoformat(row.occurred_on)
    except ValueError:
        return None
    amount = to_pesewas(row.amount)
    if amount is None or amount <= 0 or row.direction not in ("in", "out"):
        return None
    return NormalizedRow(
        occurred_on=occurred_on,
        description=(mask_identifiers(row.description) or "")[:500],
        counterparty=(mask_identifiers(row.counterparty) or None),
        reference=row.reference[:120] if row.reference else None,
        direction=row.direction,
        amount_pesewas=amount,
        fee_pesewas=to_pesewas(row.fee) or 0,
        levy_pesewas=to_pesewas(row.levy) or 0,
        balance_after_pesewas=signed_balance(row.balance_after),
        category_l1=row.category,
        page=row.page,
        source_ref=row.source_ref[:120],
    )


def signed_balance(text: str | None) -> int | None:
    """Balances can be negative (overdrafts); keep the sign for reconciliation."""
    value = to_pesewas(text)
    if value is None or text is None:
        return value
    negative = text.strip().startswith(("-", "(")) or text.strip().upper().endswith("DR")
    return -value if negative else value


def reconcile(rows: list[NormalizedRow], opening: str | None, closing: str | None) -> Reconciliation:
    breaks, checked = _running_balance_breaks(rows)
    opening_closing = _opening_closing_matches(rows, signed_balance(opening), signed_balance(closing))
    with_balance = sum(row.balance_after_pesewas is not None for row in rows)
    if breaks or opening_closing is False:
        note = (
            f"{breaks} row(s) don't follow from the previous balance."
            if breaks
            else "Opening balance plus movements doesn't equal the closing balance."
        )
        return Reconciliation("balance_breaks", with_balance, breaks, opening_closing, note)
    if opening_closing or (checked and with_balance >= max(2, int(len(rows) * 0.8))):
        return Reconciliation("reconciled", with_balance, 0, opening_closing, "Every balance on the statement adds up.")
    return Reconciliation(
        "unverifiable", with_balance, 0, opening_closing, "The document has no balances to check the rows against."
    )


def _running_balance_breaks(rows: list[NormalizedRow]) -> tuple[int, bool]:
    """Count balance breaks, trying both chronological and newest-first order."""
    if sum(row.balance_after_pesewas is not None for row in rows) < 2:
        return 0, False
    forward = _breaks_in_order(rows)
    backward = _breaks_in_order(list(reversed(rows)))
    return min(forward, backward), True


def _breaks_in_order(rows: list[NormalizedRow]) -> int:
    breaks = 0
    previous: int | None = None
    for row in rows:
        if row.balance_after_pesewas is None:
            previous = None
            continue
        if previous is not None and not _follows(previous, row):
            breaks += 1
        previous = row.balance_after_pesewas
    return breaks


def _follows(previous: int, row: NormalizedRow) -> bool:
    movement = row.amount_pesewas if row.direction == "in" else -row.amount_pesewas
    charges = row.fee_pesewas + row.levy_pesewas
    # Some providers deduct fees inside the row's balance, others on a separate row.
    candidates = (previous + movement - charges, previous + movement)
    return any(abs(candidate - row.balance_after_pesewas) <= BALANCE_TOLERANCE_PESEWAS for candidate in candidates)


def _opening_closing_matches(rows: list[NormalizedRow], opening: int | None, closing: int | None) -> bool | None:
    if opening is None or closing is None or not rows:
        return None
    net = sum(row.amount_pesewas if row.direction == "in" else -row.amount_pesewas for row in rows)
    charges = sum(row.fee_pesewas + row.levy_pesewas for row in rows)
    candidates = (opening + net - charges, opening + net)
    return any(abs(candidate - closing) <= BALANCE_TOLERANCE_PESEWAS for candidate in candidates)
