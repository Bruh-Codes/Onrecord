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
