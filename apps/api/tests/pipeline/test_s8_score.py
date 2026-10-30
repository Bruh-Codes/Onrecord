import uuid

from app.pipeline import s8_score


def _checklist(items):
    return items


def test_full_marks_reachable():
    """A business with 12 continuous months, everything captured, nothing
    unclassified, full checklist and full statement evidence scores 100-ish-the
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
        evidence_value_pesewas=100,
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
        evidence_value_pesewas=0,
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
        evidence_value_pesewas=50,
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
        evidence_value_pesewas=0,
        total_value_pesewas=100,  # some money but zero statement-backed
    )
    assert result["pillars"]["verifiability"]["earned"] == 0

def _score(**overrides):
    inputs = dict(
        continuous_months=0, unclassified_ratio=0.0, accounts_declared=0, accounts_captured=0,
        open_missing_periods=0, computable_codes=set(), checklist=[], evidence_value_pesewas=0,
        total_value_pesewas=0,
    )
    return s8_score.compute_score(**{**inputs, **overrides})


def test_typed_in_records_alone_earn_no_history():
    """Typed-in records are sorted by the owner and sit in a cash book; they
    must not earn the History points meant for statement coverage."""
    result = _score(unclassified_ratio=0.0, accounts_declared=0, total_value_pesewas=100, evidence_value_pesewas=25)
    assert result["pillars"]["coverage"]["earned"] == 0
    assert result["pillars"]["verifiability"]["earned"] == 3.75  # 0.25 x 15


def test_statement_months_score_linearly_up_to_twelve():
    points = [_score(continuous_months=m)["contributions"][1]["earned"] for m in range(6, 13)]
    assert points[0] == 12 and points[-1] == 20
    assert all(b > a for a, b in zip(points, points[1:]))
    assert points[-1] - points[-2] < 2  # no cliff between 11 and 12 months


def test_evidence_multiplier_follows_the_spec():
    assert s8_score.evidence_multiplier("momo_statement") == 1.0
    assert s8_score.evidence_multiplier("receipt") == 0.6
    assert s8_score.evidence_multiplier("informal_ledger") == 0.25
    assert s8_score.evidence_multiplier(None) == 0.0


def test_one_month_of_activity_is_not_a_readable_record():
    full = _score(computable_codes=set(s8_score.LEGIBILITY_CODES), active_months=3)
    thin = _score(computable_codes=set(s8_score.LEGIBILITY_CODES), active_months=1)
    assert full["pillars"]["legibility"]["earned"] == 25
    assert thin["pillars"]["legibility"]["earned"] < 9


def test_missing_required_document_caps_the_band_at_nearly_ready():
    result = _score(
        continuous_months=12, unclassified_ratio=0.0, accounts_declared=1, accounts_captured=1,
        computable_codes=set(s8_score.LEGIBILITY_CODES), evidence_value_pesewas=100, total_value_pesewas=100,
        checklist=[{"requirement": "required", "status": "satisfied"}] * 5 + [{"requirement": "required", "status": "missing"}],
    )
    assert result["total"] >= 85
    assert result["band"] == "nearly_ready"
