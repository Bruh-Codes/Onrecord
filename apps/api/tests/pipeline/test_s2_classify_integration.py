from datetime import date

from app.models.enums import DocType, Provider
from app.pipeline.s2_classify import ClassificationResult, classify_document


def test_high_confidence_heuristic_skips_ai(monkeypatch):
    called = {"ai": False}

    def fake_ai(*args, **kwargs):
        called["ai"] = True
        return None

    monkeypatch.setattr("app.pipeline.s2_classify_ai.classify_document_with_ai", fake_ai)

    result = classify_document(
        "MTN Mobile Money Transaction Statement 2026-01-01 2026-03-31 Opening Balance",
        "statement.pdf",
    )

    assert called["ai"] is False
    assert result.doc_type == DocType.MOMO_STATEMENT
    assert result.classifier == "heuristic"


def test_ai_overrides_low_confidence_bank_statement(monkeypatch):
    monkeypatch.setattr(
        "app.pipeline.s2_classify_ai.classify_document_with_ai",
        lambda text, filename, has_tables=False: ClassificationResult(
            DocType.BANK_STATEMENT,
            0.88,
            Provider.GCB,
            date(2026, 1, 1),
            date(2026, 1, 31),
            True,
            "Transaction table with debit and credit columns",
            classifier="ai",
        ),
    )

    result = classify_document(
        "Posted | Narration | Dr | Cr\n2026-01-05 | Customer payment | | 100.00",
        "export.csv",
        has_tables=True,
    )

    assert result.doc_type == DocType.BANK_STATEMENT
    assert result.issuer == Provider.GCB
    assert result.classifier == "ai"


def test_ai_flags_non_financial_document(monkeypatch):
    monkeypatch.setattr(
        "app.pipeline.s2_classify_ai.classify_document_with_ai",
        lambda text, filename, has_tables=False: ClassificationResult(
            DocType.OTHER,
            0.93,
            None,
            None,
            None,
            False,
            "Travel itinerary with no financial evidence",
            classifier="ai",
        ),
    )

    result = classify_document("Day 1: beach, Day 2: museum", "holiday.pdf")

    assert result.supported is False
    assert result.classifier == "ai"


def test_ai_resolves_ambiguous_financial_capture(monkeypatch):
    monkeypatch.setattr(
        "app.pipeline.s2_classify_ai.classify_document_with_ai",
        lambda text, filename, has_tables=False: ClassificationResult(
            DocType.INVOICE_RECEIVED,
            0.86,
            None,
            None,
            None,
            True,
            "Supplier tax invoice with line items and total due",
            classifier="ai",
        ),
    )

    result = classify_document(
        "Date | Details | Value\n2026-09-01 | POS settlement | 100.00",
        "export.dat",
        has_tables=True,
    )

    assert result.doc_type == DocType.INVOICE_RECEIVED
    assert result.category == "invoice"
    assert result.classifier == "ai"


def test_category_buckets():
    assert ClassificationResult(
        DocType.BANK_STATEMENT, 0.9, None, None, None, True, "x"
    ).category == "statement"
    assert ClassificationResult(
        DocType.INVOICE_ISSUED, 0.9, None, None, None, True, "x"
    ).category == "invoice"
    assert ClassificationResult(
        DocType.RECEIPT, 0.9, None, None, None, True, "x"
    ).category == "other"
