from app.models.enums import DocType, Provider
from app.pipeline.s2_classify import classify_document


def test_classifies_mtn_momo_statement():
    result = classify_document(
        "MTN Mobile Money Transaction Statement 2026-01-01 2026-03-31 Opening Balance",
        "statement.pdf",
    )

    assert result.doc_type == DocType.MOMO_STATEMENT
    assert result.issuer == Provider.MTN
    assert result.supported is True


def test_flags_non_financial_document_as_unsupported():
    result = classify_document("My holiday itinerary and packing list", "holiday.pdf")

    assert result.doc_type == DocType.OTHER
    assert result.supported is False
    assert "not a supported" in result.reason


def test_classifies_momo_report_filename_when_ocr_header_is_unclear():
    result = classify_document("Date Description Amount Balance", "MomoStatementReport.pdf")

    assert result.doc_type == DocType.MOMO_STATEMENT
    assert result.issuer == Provider.MTN
    assert result.supported is True


def test_statement_period_accepts_month_name_dates():
    result = classify_document(
        "MOBILE MONEY TRANSACTION HISTORY From: 03-May-2025 To: 31-May-2025",
        "MomoStatementReport.pdf",
    )

    assert result.period_start.isoformat() == "2025-05-03"
    assert result.period_end.isoformat() == "2025-05-31"
