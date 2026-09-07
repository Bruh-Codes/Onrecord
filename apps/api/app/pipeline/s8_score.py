"""S8 — Readiness score (specs/06-scoring-checklist.md).

Measured against completeness and internal consistency, NOT creditworthiness
(INV-5). Every point is attributable: `contributions` carries per-component
`earned/available/reason`. Same inputs + RUBRIC_VERSION -> identical output.
"""

RUBRIC_VERSION = "1.0.0"

LEGIBILITY_CODES = (
    "REV_MONTHLY",
    "REV_GROWTH_3M",
    "OPEX_RATIO",
    "OPERATING_CASHFLOW",
    "ACTIVE_TRADING_DAYS",
    "AVG_TICKET",
    "EXISTING_DEBT_SERVICE",
    "UNCLASSIFIED_RATIO",
    "NET_CASHFLOW",
    "NEGATIVE_BALANCE_DAYS",
)

REQUIREMENT_WEIGHT = {"required": 3, "conditional": 2, "optional": 1}

_EVIDENCE_MULTIPLIER = {
    "bank_statement": 1.0,
    "momo_statement": 1.0,
    "momo_merchant_statement": 1.0,
    "invoice_issued": 1.0,
    "invoice_received": 1.0,
    "receipt": 0.6,
    "informal_ledger": 0.25,
}


def compute_score(
    *,
    continuous_months: int,
    unclassified_ratio: float | None,
    accounts_declared: int,
    accounts_captured: int,
    open_missing_periods: int,
    computable_codes: set[str],
    checklist: list[dict],
    statement_value_pesewas: int,
    total_value_pesewas: int,
) -> dict:
    """Returns the full readiness_score payload. All inputs integer/float;
    money in pesewas. checklist items carry {requirement, status, doc_type}."""
    contributions: list[dict] = []

    # ---- coverage (30) ----
    if continuous_months >= 12:
        months_pts = 20
        months_reason = f"{continuous_months} continuous months of statements; 12 earns full marks"
    elif continuous_months >= 6:
        months_pts = 12 + (continuous_months - 6)
        months_reason = f"{continuous_months} continuous months; 12 earns full marks"
    elif continuous_months >= 3:
        months_pts = 5 + int((continuous_months - 3) * (12 - 5) / 3)
        months_reason = f"{continuous_months} continuous months of statements"
    else:
        months_pts = 0
        months_reason = "fewer than 3 continuous months of statements"

    unclassified_pts = 0
    if unclassified_ratio is not None:
        unclassified_pts = round(5 * (1 - min(unclassified_ratio, 1.0)), 2)
    unclassified_reason = (
        f"{round((unclassified_ratio or 0) * 100)}% of transaction value is unclassified"
        if unclassified_ratio is not None
        else "no transactions to classify"
    )

    captured_pts = 0
    if accounts_declared:
        captured_pts = round(5 * min(accounts_captured / accounts_declared, 1.0), 2)

    coverage_earned = months_pts + unclassified_pts + captured_pts - 2 * open_missing_periods
    coverage_earned = max(0.0, min(30.0, coverage_earned))

    contributions.append({"component": "coverage.unclassified_ratio", "pillar": "coverage", "earned": unclassified_pts, "available": 5, "reason": unclassified_reason})
    contributions.append({"component": "coverage.continuous_months", "pillar": "coverage", "earned": months_pts, "available": 20, "reason": months_reason})
    contributions.append({"component": "coverage.accounts_captured", "pillar": "coverage", "earned": captured_pts, "available": 5, "reason": f"{accounts_captured} of {accounts_declared} declared accounts captured"})
    if open_missing_periods:
        contributions.append({"component": "coverage.open_missing_periods", "pillar": "coverage", "earned": -2 * open_missing_periods, "available": 0, "reason": f"{open_missing_periods} open missing-period gaps"})

    # ---- legibility (25) ----
    legible = sum(1 for j in computable_codes if j in LEGIBILITY_CODES)
    legibility_earned = min(25.0, 2.5 * legible)
    contributions.append({"component": "legibility", "pillar": "legibility", "earned": round(legibility_earned, 2), "available": 25.0, "reason": f"{legible} of {len(LEGIBILITY_CODES)} core indicators computable"})

    # ---- documentation (30) ----
    numerator, denominator = 0, 0
    for item in checklist:
        weight = REQUIREMENT_WEIGHT.get(item["requirement"], 1)
        if item["status"] == "not_applicable":
            continue
        denominator += weight
        if item["status"] == "satisfied":
            numerator += weight
    doc_earned = round(30 * (numerator / denominator), 2) if denominator else 0.0
    contributions.append({"component": "documentation", "pillar": "documentation", "earned": doc_earned, "available": 30.0, "reason": f"{numerator}/{denominator} checklist weight satisfied"})

    # ---- verifiability (15) ----
    if total_value_pesewas > 0:
        weighted_share = statement_value_pesewas / total_value_pesewas
        verif_pts = round(15 * weighted_share, 2)
        verif_reason = f"{round(weighted_share * 100)}% of transaction value backed by statements"
    else:
        verif_pts = 0.0
        verif_reason = "no transactions to evidence"
    contributions.append({"component": "verifiability", "pillar": "verifiability", "earned": verif_pts, "available": 15.0, "reason": verif_reason})

    total = round(coverage_earned + legibility_earned + doc_earned + verif_pts, 2)
    band = _band(total)

    return {
        "rubric_version": RUBRIC_VERSION,
        "total": total,
        "band": band,
        "pillars": {
            "coverage": {"earned": coverage_earned, "available": 30},
            "legibility": {"earned": legibility_earned, "available": 25},
            "documentation": {"earned": doc_earned, "available": 30},
            "verifiability": {"earned": verif_pts, "available": 15},
        },
        "contributions": contributions,
    }


def _band(total: float) -> str:
    if total < 40:
        return "not_ready"
    if total < 65:
        return "developing"
    if total < 85:
        return "nearly_ready"
    return "lender_ready"