from app.services.evidence_review import allow_partial_transaction_use, _sanitize_text, _validated_review


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
