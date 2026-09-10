from app.services.evidence_review import _sanitize_text, _validated_review


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
