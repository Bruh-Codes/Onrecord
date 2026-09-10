"""Provider-neutral invoice extraction from Docling text and tables.

The parser intentionally has a stable canonical envelope, while preserving
unknown labels and raw values so new invoice layouts do not require templates.
It never uses an inferred amount: every monetary value must have a source line.
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.document_processing.docling import DocumentTable


@dataclass(frozen=True)
class InvoiceLineItem:
    description: str
    quantity: str | None
    unit_price_pesewas: int | None
    line_total_pesewas: int | None
    raw: dict[str, str]
    page: int | None = None


@dataclass(frozen=True)
class InvoiceField:
    key: str
    value: Any
    raw_value: str
    source_label: str
    page: int | None
    confidence: float = 0.85


@dataclass
class ParsedInvoice:
    fields: list[InvoiceField] = field(default_factory=list)
    line_items: list[InvoiceLineItem] = field(default_factory=list)
    extra_fields: dict[str, str] = field(default_factory=dict)
    validation_issues: list[str] = field(default_factory=list)

    def get(self, key: str) -> InvoiceField | None:
        return next((item for item in self.fields if item.key == key), None)


_LABELS = {
    "supplier": ("supplier", "vendor", "seller", "from", "billed by", "provided by"),
    "invoice_number": ("invoice number", "invoice no", "invoice #", "bill number", "bill no", "reference number", "reference no"),
    "invoice_date": ("invoice date", "issue date", "issued on", "date issued"),
    "due_date": ("due date", "payment due", "due on", "pay by"),
    "subtotal": ("subtotal", "sub total", "net amount"),
    "tax": ("tax", "vat", "gst", "sales tax", "tax amount"),
    "total": ("grand total", "total due", "amount due", "total payable", "invoice total", "total"),
    "payment_status": ("payment status", "status", "amount paid", "paid", "balance due"),
    "currency": ("currency", "currency code"),
}
_DATE_RE = re.compile(r"\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b")
_MONEY_RE = re.compile(r"(?P<currency>GHS|GH₵|GHC|USD|EUR|GBP|CAD|AUD|₵|\$|€|£)?\s*[-(]?\s*(?P<number>[\d,]+(?:\.\d{1,4})?)\s*\)?", re.I)


def parse_invoice(text: str, tables: tuple[DocumentTable, ...] = ()) -> ParsedInvoice:
    result = ParsedInvoice()
    lines = [re.sub(r"\s+", " ", line).strip(" |") for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        label, raw = _split_label(line)
        if label is None and index + 1 < len(lines):
            standalone_key = _canonical_label(line)
            if standalone_key is not None:
                label, raw = line, lines[index + 1]
        if label is None or not raw:
            continue
        key = _canonical_label(label)
        if key == "supplier" and _looks_like_company(raw):
            _add(result, key, raw, raw, label, index + 1)
        elif key in {"invoice_date", "due_date"}:
            parsed = _parse_date(raw)
            if parsed:
                _add(result, key, parsed.isoformat(), raw, label, index + 1)
        elif key in {"subtotal", "tax", "total"}:
            money = _parse_money(raw)
            if money:
                _add(result, key, money, raw, label, index + 1)
        elif key == "invoice_number":
            _add(result, key, raw, raw, label, index + 1)
        elif key == "payment_status":
            _add(result, key, _status(raw), raw, label, index + 1)
        elif key == "currency":
            _add(result, key, raw.upper(), raw, label, index + 1)
        else:
            result.extra_fields[_clean_key(label)] = raw

    _infer_supplier_from_header(result, lines)
    _extract_table_fields(result, tables)
    _infer_currency(result, lines)
    result.line_items.extend(_table_items(tables))
    _validate(result)
    return result


def _split_label(line: str) -> tuple[str | None, str]:
    match = re.match(r"^([^:|]{2,45})\s*[:|]\s*(.+)$", line)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    # Docling may flatten a visually separate label/value pair into one line
    # without punctuation, e.g. ``Total (USD) 118.00`` or ``Invoice # Z-9``.
    normalized = line.lower()
    aliases = sorted((alias for values in _LABELS.values() for alias in values), key=len, reverse=True)
    for alias in aliases:
        if normalized == alias or not normalized.startswith(alias):
            continue
        remainder = line[len(alias):].strip(" :#-|()[]")
        if remainder:
            return alias, remainder
    return None, ""


def _canonical_label(label: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9 ]", "", label.lower()).strip()
    for key, aliases in _LABELS.items():
        normalized_aliases = [re.sub(r"[^a-z0-9 ]", "", alias.lower()).strip() for alias in aliases]
        if normalized in normalized_aliases or any(normalized.startswith(alias + " ") for alias in normalized_aliases):
            return key
    return None


def _parse_date(value: str) -> date | None:
    match = _DATE_RE.search(value)
    if not match:
        return None
    candidate = match.group(0).replace(".", "/")
    for pattern in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(candidate, pattern).date()
        except ValueError:
            continue
    return None


def _parse_money(value: str) -> dict[str, Any] | None:
    match = list(_MONEY_RE.finditer(value))[-1:] 
    if not match:
        return None
    token = match[0]
    try:
        amount = Decimal(token.group("number").replace(",", ""))
    except InvalidOperation:
        return None
    currency = _currency(token.group("currency"))
    return {"amount_pesewas": int((amount * 100).quantize(Decimal("1"))), "currency": currency}


def _currency(value: str | None) -> str | None:
    if not value:
        return None
    return {"₵": "GHS", "GH₵": "GHS", "GHC": "GHS", "$": "USD", "€": "EUR", "£": "GBP"}.get(value.upper(), value.upper())


def _status(value: str) -> str:
    lowered = value.lower()
    if "paid" in lowered and "unpaid" not in lowered:
        return "paid"
    if "partial" in lowered:
        return "partially_paid"
    if "due" in lowered or "unpaid" in lowered or "outstanding" in lowered:
        return "unpaid"
    return value.strip().lower()


def _add(result: ParsedInvoice, key: str, value: Any, raw_value: str, source_label: str, page: int | None) -> None:
    if result.get(key) is None:
        result.fields.append(InvoiceField(key, value, raw_value, source_label, page))


def _infer_supplier_from_header(result: ParsedInvoice, lines: list[str]) -> None:
    if result.get("supplier"):
        return
    for line in lines[:8]:
        if not _canonical_label(line) and not _DATE_RE.search(line) and not re.search(r"invoice|tax|total|bill", line, re.I):
            if _looks_like_company(line):
                _add(result, "supplier", line, line, "document header", 1)
                return


def _looks_like_company(value: str) -> bool:
    return len(value) >= 2 and not re.fullmatch(r"[\d\W]+", value) and len(value.split()) <= 12


def _infer_currency(result: ParsedInvoice, lines: list[str]) -> None:
    if result.get("currency"):
        return
    found = next((m.group("currency") for line in lines for m in _MONEY_RE.finditer(line) if m.group("currency")), None)
    if found:
        _add(result, "currency", _currency(found), found, "currency symbol", 1)


def _table_items(tables: tuple[DocumentTable, ...]) -> list[InvoiceLineItem]:
    items: list[InvoiceLineItem] = []
    for table in tables:
        rows: dict[int, dict[int, str]] = {}
        for cell in table.cells:
            rows.setdefault(cell.row, {})[cell.column] = cell.text.strip()
        if not rows:
            continue
        headers = rows.get(min(rows), {})
        header_text = " ".join(headers.values()).lower()
        if not any(token in header_text for token in ("description", "item", "service")) or not any(token in header_text for token in ("amount", "total", "price")):
            continue
        for row_number, values in sorted(rows.items()):
            if row_number == min(rows):
                continue
            raw = {str(key): value for key, value in values.items() if value}
            if not raw:
                continue
            description = next((value for key, value in values.items() if "description" in headers.get(key, "").lower() or "item" in headers.get(key, "").lower()), next(iter(values.values()), ""))
            amounts = [_parse_money(value) for value in values.values()]
            amounts = [value for value in amounts if value]
            items.append(InvoiceLineItem(description, None, None, amounts[-1]["amount_pesewas"] if amounts else None, raw, table.page))
    return items


def _extract_table_fields(result: ParsedInvoice, tables: tuple[DocumentTable, ...]) -> None:
    """Read label/value rows that Docling keeps in table cells rather than markdown."""
    for table in tables:
        rows: dict[int, list[str]] = {}
        for cell in table.cells:
            rows.setdefault(cell.row, []).append(cell.text.strip())
        for values in rows.values():
            cells = [value for value in values if value]
            if len(cells) < 2:
                continue
            label_index = next((index for index, value in enumerate(cells) if _canonical_label(value)), None)
            if label_index is None:
                continue
            label = cells[label_index]
            key = _canonical_label(label)
            raw = " ".join(cells[label_index + 1:])
            if not key or not raw:
                continue
            if key in {"subtotal", "tax", "total"}:
                money = _parse_money(raw)
                if money:
                    _add(result, key, money, raw, label, table.page)
            elif key in {"invoice_date", "due_date"}:
                parsed = _parse_date(raw)
                if parsed:
                    _add(result, key, parsed.isoformat(), raw, label, table.page)
            elif key in {"supplier", "invoice_number", "payment_status", "currency"}:
                value = _status(raw) if key == "payment_status" else raw
                _add(result, key, value.upper() if key == "currency" else value, raw, label, table.page)


def _validate(result: ParsedInvoice) -> None:
    total = result.get("total")
    if not result.get("supplier"):
        result.validation_issues.append("supplier_missing")
    if not total:
        result.validation_issues.append("total_missing")
    subtotal, tax = result.get("subtotal"), result.get("tax")
    if subtotal and tax and total and subtotal.value["amount_pesewas"] + tax.value["amount_pesewas"] != total.value["amount_pesewas"]:
        result.validation_issues.append("subtotal_tax_total_mismatch")
    invoice_date, due_date = result.get("invoice_date"), result.get("due_date")
    if invoice_date and due_date and date.fromisoformat(due_date.value) < date.fromisoformat(invoice_date.value):
        result.validation_issues.append("due_date_before_invoice_date")


def _clean_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
