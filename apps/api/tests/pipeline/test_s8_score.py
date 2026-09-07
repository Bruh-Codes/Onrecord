import uuid

from app.pipeline import s8_score


def _checklist(items):
    return items


def test_full_marks_reachable():
    """A business with 12 continuous months, everything captured, nothing
    unclassified, full checklist and full statement evidence scores 100-ish — the
    coverage pillar's 30 must be reachable (specs/06-scoring-checklist.md)."""
    result = s8_score.compute_score(
        continuous_months=12,
        unclassified_ratio=0.0,
        accounts_declared=2,
        accounts_captured=2,
        open_missing_periods=0,
        computable_codes=set(s8_score.LEGIBILITY_CODES),
        checklist=[
            {"requirement": "required", "status": "satisfied"},
            {"requirement": "required", "status": "satisfied"},
            {"requirement": "conditional", "status": "satisfied"},
        ],
        statement_value_pesewas=100,
        total_value_pesewas=100,
    )
    assert result["pillars"]["coverage"]["earned"] == 30
    assert result["total"] >= 85


def test_band_boundaries_are_contiguous():
    scores = [0, 39.9, 40, 64.9, 65, 84.9, 85, 100]
    bands = [s8_score._band(s) for s in scores]
    assert bands == ["not_ready", "not_ready", "developing", "developing", "nearly_ready", "nearly_ready", "lender_ready", "lender_ready"]


def test_missing_periods_deduct_after_pillar_cap():
    result = s8_score.compute_score(
        continuous_months=3,
        unclassified_ratio=None,
        accounts_declared=1,
        accounts_captured=0,
        open_missing_periods=5,
        computable_codes=set(),
        checklist=[],
        statement_value_pesewas=0,
        total_value_pesewas=0,
    )
    assert result["pillars"]["coverage"]["earned"] >= 0
    assert result["band"] in ("not_ready", "developing")


def test_contributions_are_attributable():
    result = s8_score.compute_score(
        continuous_months=6,
        unclassified_ratio=0.2,
        accounts_declared=1,
        accounts_captured=1,
        open_missing_periods=0,
        computable_codes={"REV_MONTHLY", "OPEX_RATIO"},
        checklist=[{"requirement": "required", "status": "missing"}],
        statement_value_pesewas=50,
        total_value_pesewas=100,
    )
    assert result["contributions"]
    for c in result["contributions"]:
        assert "reason" in c and "earned" in c and "available" in c


def test_declared_only_evidence_scores_zero_verifiability():
    result = s8_score.compute_score(
        continuous_months=0,
        unclassified_ratio=None,
        accounts_declared=0,
        accounts_captured=0,
        open_missing_periods=0,
        computable_codes=set(),
        checklist=[],
        statement_value_pesewas=0,
        total_value_pesewas=100,  # some money but zero statement-backed
    )
    assert result["pillars"]["verifiability"]["earned"] == 0