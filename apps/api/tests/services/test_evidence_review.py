from app.services.evidence_review import allow_partial_transaction_use, _sanitize_text, _validated_review
from types import SimpleNamespace

from app.services.evidence_review import review_extracted_document


def test_sanitize_redacts_financial_identifiers_and_amounts():
    sanitized = _sanitize_text("Date 2025-05-01 paid GH¢1,234.50 to 0241234567 ref 998877")
    assert "2025-05-01" not in sanitized
    assert "1,234.50" not in sanitized
    assert "0241234567" not in sanitized
    assert "998877" not in sanitized
    assert "<amount>" in sanitized


def test_validated_review_only_allows_clear_low_risk_to_score():
    review = _validated_review(
        {
            "status": "warning",
            "risk_level": "medium",
            "summary": "Review needed",
            "findings": [{"code": "LAYOUT", "severity": "medium", "reason": "Needs review", "evidence_ref": "page:1"}],
        },
        input_hash="abc",
        model="gpt-5.6-luna",
    )
    assert review.scoring_eligible is False
    assert review.findings[0].evidence_ref == "page:1"


def test_allows_mostly_complete_transaction_statement_to_remain_usable_with_warning():
    review = _validated_review(
        {"status": "warning", "risk_level": "medium", "summary": "Minor table artifacts", "findings": []},
        input_hash="abc",
        model="gpt-5.6-luna",
    )

    partial = allow_partial_transaction_use(
        review,
        row_count=134,
        rows_missing_balance=2,
        rows_with_description_artifacts=7,
    )

    assert partial.status == "warning"
    assert partial.scoring_eligible is True


def test_raw_capture_is_not_blocked_by_redacted_or_repeated_fields(monkeypatch):
    monkeypatch.setattr(
        "app.services.evidence_review.get_settings",
        lambda: SimpleNamespace(llm_api_key="configured", financial_mapping_model="test-model"),
    )

    review = review_extracted_document(
        doc_type="other",
        page_count=1,
        extracted_text="Employee | Month | Net Pay\nAma | <date> | <amount>",
        review_context={"raw_capture": True, "interpretation_pending": True},
    )

    assert review.status == "clear"
    assert review.scoring_eligible is True
    assert review.findings == ()


def test_allows_short_statement_when_core_transactions_are_parsed():
    review = _validated_review(
        {"status": "warning", "risk_level": "medium", "summary": "Optional fields are incomplete", "findings": []},
        input_hash="abc",
        model="gpt-5.6-luna",
    )

    partial = allow_partial_transaction_use(
        review,
        row_count=8,
        rows_missing_balance=8,
        rows_with_description_artifacts=0,
    )

    assert partial.scoring_eligible is True
