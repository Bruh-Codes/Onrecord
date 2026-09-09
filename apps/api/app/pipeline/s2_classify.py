"""Classify Docling output using explainable issuer and document fingerprints."""

import re
from dataclasses import dataclass
from datetime import date

from app.models.enums import DocType, Provider


@dataclass(frozen=True)
class ClassificationResult:
    doc_type: DocType
    confidence: float
    issuer: Provider | None
    period_start: date | None
    period_end: date | None
    supported: bool
    reason: str


_ISSUERS = {
    "mtn mobile money": Provider.MTN,
    "telecel cash": Provider.TELECEL,
    "gcb bank": Provider.GCB,
    "fidelity bank": Provider.FIDELITY,
    "absa bank": Provider.ABSA,
    "stanbic bank": Provider.STANBIC,
    "ecobank": Provider.ECOBANK,
    "consolidated bank ghana": Provider.CBG,
}


def classify_document(text: str, filename: str) -> ClassificationResult:
    """Return a supported financial type only when document evidence warrants it."""
    haystack = f"{filename}\n{text}".lower()
    issuer = next((provider for marker, provider in _ISSUERS.items() if marker in haystack), None)
    period_start, period_end = _statement_period(haystack)

    if "mtn mobile money" in haystack or "momo statement" in haystack:
        doc_type = DocType.MOMO_MERCHANT_STATEMENT if "merchant" in haystack else DocType.MOMO_STATEMENT
        return ClassificationResult(doc_type, 0.95, issuer or Provider.MTN, period_start, period_end, True, "MoMo statement header detected")
    if issuer is not None and ("statement" in haystack or "opening balance" in haystack):
        return ClassificationResult(DocType.BANK_STATEMENT, 0.92, issuer, period_start, period_end, True, "Bank statement header detected")
    if "invoice" in haystack:
        doc_type = DocType.INVOICE_RECEIVED if "supplier" in haystack else DocType.INVOICE_ISSUED
        return ClassificationResult(doc_type, 0.82, None, None, None, True, "Invoice markers detected")
    if "receipt" in haystack or "total paid" in haystack:
        return ClassificationResult(DocType.RECEIPT, 0.80, None, None, None, True, "Receipt markers detected")
    if "cash book" in haystack or "cashbook" in haystack or "ledger" in haystack:
        return ClassificationResult(DocType.INFORMAL_LEDGER, 0.78, None, None, None, True, "Ledger markers detected")
    if "financial statement" in haystack or "profit and loss" in haystack or "balance sheet" in haystack:
        return ClassificationResult(DocType.FINANCIAL_STATEMENT, 0.78, None, None, None, True, "Financial statement markers detected")
    if not text.strip():
        return ClassificationResult(DocType.OTHER, 0.0, None, None, None, False, "No readable text or tables were found")
    return ClassificationResult(DocType.OTHER, 0.0, None, None, None, False, "File is not a supported financial or business document")


def _statement_period(text: str) -> tuple[date | None, date | None]:
    dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    parsed: list[date] = []
    for value in dates[:6]:
        try:
            parsed.append(date.fromisoformat(value))
        except ValueError:
            continue
    return (parsed[0], parsed[1]) if len(parsed) >= 2 else (None, None)
