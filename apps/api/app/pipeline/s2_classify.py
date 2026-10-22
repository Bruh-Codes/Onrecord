"""Classify normalized document capture using heuristics plus optional AI."""

import re
from dataclasses import dataclass
from datetime import date, datetime

from app.models.enums import DocType, Provider

# Heuristics above this threshold are trusted without an LLM call.
_HEURISTIC_AUTO_CONFIDENCE = 0.90
# Below this threshold, an LLM pass is attempted when configured.
_HEURISTIC_AI_THRESHOLD = 0.75


@dataclass(frozen=True)
class ClassificationResult:
    doc_type: DocType
    confidence: float
    issuer: Provider | None
    period_start: date | None
    period_end: date | None
    supported: bool
    reason: str
    classifier: str = "heuristic"

    @property
    def category(self) -> str:
        """Broad bucket for routing: statement, invoice, or other."""
        if self.doc_type in {
            DocType.BANK_STATEMENT,
            DocType.MOMO_STATEMENT,
            DocType.MOMO_MERCHANT_STATEMENT,
            DocType.FINANCIAL_STATEMENT,
        }:
            return "statement"
        if self.doc_type in {DocType.INVOICE_ISSUED, DocType.INVOICE_RECEIVED}:
            return "invoice"
        return "other"


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


def classify_document(text: str, filename: str, *, has_tables: bool = False) -> ClassificationResult:
    """Classify a document using heuristics first, then optional AI."""
    heuristic = _classify_heuristic(text, filename, has_tables=has_tables)
    if heuristic.confidence >= _HEURISTIC_AUTO_CONFIDENCE:
        return heuristic

    from app.pipeline.s2_classify_ai import classify_document_with_ai

    ai_result = classify_document_with_ai(text, filename, has_tables=has_tables)
    if ai_result is None:
        return heuristic

    ai_result = ClassificationResult(
        ai_result.doc_type,
        ai_result.confidence,
        ai_result.issuer,
        ai_result.period_start,
        ai_result.period_end,
        ai_result.supported,
        ai_result.reason,
        classifier="ai",
    )

    if heuristic.confidence < _HEURISTIC_AI_THRESHOLD:
        return _prefer_ai_result(heuristic, ai_result)
    if not heuristic.supported and ai_result.supported:
        return ai_result
    if (
        heuristic.supported
        and heuristic.doc_type == DocType.OTHER
        and ai_result.supported
        and ai_result.doc_type != DocType.OTHER
    ):
        return ai_result
    if ai_result.doc_type == heuristic.doc_type:
        return ClassificationResult(
            heuristic.doc_type,
            max(heuristic.confidence, ai_result.confidence),
            heuristic.issuer or ai_result.issuer,
            heuristic.period_start or ai_result.period_start,
            heuristic.period_end or ai_result.period_end,
            heuristic.supported,
            heuristic.reason,
            classifier="heuristic+ai",
        )
    if ai_result.confidence > heuristic.confidence:
        return ai_result
    return heuristic


def _prefer_ai_result(
    heuristic: ClassificationResult,
    ai_result: ClassificationResult,
) -> ClassificationResult:
    if ai_result.confidence >= heuristic.confidence:
        return ai_result
    if not heuristic.supported and not ai_result.supported:
        return ai_result
    return heuristic


def _classify_heuristic(text: str, filename: str, *, has_tables: bool = False) -> ClassificationResult:
    """Return a supported financial type only when document evidence warrants it."""
    haystack = f"{filename}\n{text}".lower()
    issuer = next((provider for marker, provider in _ISSUERS.items() if marker in haystack), None)
    period_start, period_end = _statement_period(haystack)

    filename_tokens = re.sub(r"[^a-z0-9]+", " ", filename.lower())
    momo_filename = "momo" in filename_tokens and any(
        token in filename_tokens for token in ("statement", "report", "transaction", "transactions", "tx")
    )
    if "mtn mobile money" in haystack or "momo statement" in haystack or momo_filename:
        doc_type = DocType.MOMO_MERCHANT_STATEMENT if "merchant" in haystack else DocType.MOMO_STATEMENT
        reason = "MoMo statement header detected" if not momo_filename else "MoMo statement filename detected"
        return ClassificationResult(doc_type, 0.90 if momo_filename else 0.95, issuer or Provider.MTN, period_start, period_end, True, reason, classifier="heuristic")
    if issuer is not None and ("statement" in haystack or "opening balance" in haystack):
        return ClassificationResult(DocType.BANK_STATEMENT, 0.92, issuer, period_start, period_end, True, "Bank statement header detected", classifier="heuristic")

    # Bank exports frequently omit the bank name from the sheet and some
    # issuers are not in our provider enum.  If the file has a statement title
    # and several transaction/balance columns, treat it as a bank statement
    # and leave the issuer unknown rather than rejecting financial evidence.
    bank_statement_markers = (
        "transaction", "transaction date", "debit", "credit", "amount",
        "balance", "bal before", "bal after", "opening balance",
        "closing balance", "value date",
    )
    marker_count = sum(marker in haystack for marker in bank_statement_markers)
    has_transaction_shape = any(marker in haystack for marker in ("transaction", "transaction date", "posted", "value date"))
    if marker_count >= 2 and (
        ("statement" in haystack and any(marker in haystack for marker in ("debit", "credit", "balance", "running balance")))
        or (has_tables and has_transaction_shape)
    ):
        return ClassificationResult(
            DocType.BANK_STATEMENT,
            0.78 if "statement" in haystack else 0.70,
            issuer,
            period_start,
            period_end,
            True,
            "Bank statement transaction and balance markers detected",
        )
    if "invoice" in haystack:
        doc_type = DocType.INVOICE_RECEIVED if "supplier" in haystack else DocType.INVOICE_ISSUED
        return ClassificationResult(doc_type, 0.82, None, None, None, True, "Invoice markers detected")
    if "receipt" in haystack or "total paid" in haystack:
        return ClassificationResult(DocType.RECEIPT, 0.80, None, None, None, True, "Receipt markers detected")
    if "cash book" in haystack or "cashbook" in haystack or "ledger" in haystack:
        return ClassificationResult(DocType.INFORMAL_LEDGER, 0.78, None, None, None, True, "Ledger markers detected")
    financial_statement_markers = (
        "financial statement",
        "financial statements",
        "profit and loss",
        "income statement",
        "statement of profit or loss",
        "statement of comprehensive income",
        "balance sheet",
        "statement of financial position",
        "cash flow statement",
        "statement of cash flows",
        "statement of changes in equity",
        "management accounts",
    )
    financial_line_markers = (
        "gross profit",
        "profit before tax",
        "total assets",
        "total liabilities",
        "current assets",
        "current liabilities",
        "cash and cash equivalents",
        "retained earnings",
    )
    has_financial_lines = sum(marker in haystack for marker in financial_line_markers) >= 2
    if any(marker in haystack for marker in financial_statement_markers) or has_financial_lines:
        return ClassificationResult(DocType.FINANCIAL_STATEMENT, 0.78, None, None, None, True, "Financial statement markers detected")
    if not text.strip():
        return ClassificationResult(DocType.OTHER, 0.0, None, None, None, False, "No readable text or tables were found")
    if _looks_like_financial_record(haystack, has_tables):
        # Keep the file even when its shape is unfamiliar. Specialized
        # interpreters may not understand it yet, but the normalized capture
        # remains available for review and future parsers.
        return ClassificationResult(
            DocType.OTHER,
            0.35,
            issuer,
            period_start,
            period_end,
            True,
            "Readable financial record captured; shape requires review",
        )
    return ClassificationResult(DocType.OTHER, 0.0, None, None, None, False, "File is not a supported financial or business document")


def _looks_like_financial_record(text: str, has_tables: bool) -> bool:
    markers = (
        "statement", "transaction", "ledger", "cash book", "invoice", "receipt",
        "debit", "credit", "balance", "amount", "value", "payment", "revenue", "sales",
        "expense", "asset", "liabilit", "equity", "cash flow", "profit", "narration",
        "details", "posted", "deposit", "withdrawal", "pos", " dr", " cr", "payout",
        "gross", "net", "fees", "refund", "settlement", "payroll", "holding", "portfolio",
        "trial balance", "aging", "operating", "authorized", "settled",
    )
    marker_count = sum(marker in text for marker in markers)
    has_number = bool(re.search(r"\b\d[\d,.]*\b|\b(?:19|20)\d{2}\b", text))
    return marker_count >= 2 or (has_tables and marker_count >= 1) or (marker_count >= 1 and has_number)


def _statement_period(text: str) -> tuple[date | None, date | None]:
    dates = re.findall(
        r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|"
        r"\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- ]\d{4})\b",
        text,
        re.IGNORECASE,
    )
    parsed: list[date] = []
    for value in dates[:6]:
        try:
            normalized = value.replace(".", "/")
            for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y", "%d-%B-%Y", "%d %B %Y"):
                try:
                    parsed.append(datetime.strptime(normalized, pattern).date())
                    break
                except ValueError:
                    continue
        except ValueError:
            continue
    return (parsed[0], parsed[1]) if len(parsed) >= 2 else (None, None)
