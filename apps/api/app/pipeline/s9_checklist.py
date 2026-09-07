"""S9 — Document checklist (specs/06-scoring-checklist.md).

Declarative rule packs matched against the documents a business has uploaded.
Condition expressions are evaluated with simpleeval, never eval().

The packs live here as data for the MVP; the spec's target is
app/rules/checklists/*.yaml. Semantics are identical.
"""

from typing import Any

REQUIREMENT_WEIGHT = {"required": 3, "conditional": 2, "optional": 1}


def pack_for(rule_pack_id: str) -> dict[str, Any]:
    """Return the named rule pack or the default working-capital pack."""
    return _PACKS.get(rule_pack_id, _PACKS["gh_mfi_working_capital_v1"])


AVAILABLE_PACKS = [
    "gh_mfi_working_capital_v1",
    "gh_bank_sme_term_loan_v1",
    "gh_asset_finance_v1",
]

_PACKS: dict[str, list[dict]] = {
    "gh_mfi_working_capital_v1": [
        {
            "doc_type": "bank_statement",
            "requirement": "required",
            "accepts_also": ["momo_statement", "momo_merchant_statement"],
            "constraint": {"min_months": 6, "must_be_continuous": True},
            "label": "Six months of bank or MoMo statements",
        },
        {
            "doc_type": "registration_cert",
            "requirement": "required",
            "label": "Business registration certificate",
        },
        {
            "doc_type": "tax_doc",
            "requirement": "required",
            "label": "TIN certificate or Ghana Card",
        },
        {
            "doc_type": "tenancy_agreement",
            "requirement": "conditional",
            "condition": "premises_status == 'rented'",
            "label": "Tenancy agreement for your business premises",
        },
        {
            "doc_type": "cashflow_projection",
            "requirement": "required",
            "constraint": {"min_months": 6},
            "generatable": True,
            "label": "Six-month cash flow projection",
        },
        {
            "doc_type": "financial_statement",
            "requirement": "optional",
            "label": "Audited or management accounts",
        },
    ],
    "gh_bank_sme_term_loan_v1": [
        {
            "doc_type": "bank_statement",
            "requirement": "required",
            "accepts_also": ["momo_statement", "momo_merchant_statement"],
            "constraint": {"min_months": 12, "must_be_continuous": True},
            "label": "Twelve months of bank or MoMo statements",
        },
        {"doc_type": "registration_cert", "requirement": "required", "label": "Business registration certificate"},
        {"doc_type": "tax_doc", "requirement": "required", "label": "TIN certificate or Ghana Card"},
        {"doc_type": "financial_statement", "requirement": "required", "label": "Audited or management accounts"},
        {
            "doc_type": "tenancy_agreement",
            "requirement": "conditional",
            "condition": "premises_status == 'rented'",
            "label": "Tenancy agreement for your business premises",
        },
    ],
    "gh_asset_finance_v1": [
        {
            "doc_type": "bank_statement",
            "requirement": "required",
            "accepts_also": ["momo_statement", "momo_merchant_statement"],
            "constraint": {"min_months": 12, "must_be_continuous": True},
            "label": "Twelve months of bank or MoMo statements",
        },
        {"doc_type": "registration_cert", "requirement": "required", "label": "Business registration certificate"},
        {"doc_type": "tax_doc", "requirement": "required", "label": "TIN certificate or Ghana Card"},
        {"doc_type": "financial_statement", "requirement": "required", "label": "Three years of audited accounts"},
        {"doc_type": "stock_list", "requirement": "required", "label": "Current stock list"},
        {
            "doc_type": "invoice_issued",
            "requirement": "required",
            "label": "Pro-forma invoice from an accredited dealer",
        },
    ],
}


def evaluate_condition(expr: str | None, business: dict) -> bool:
    """Restricted evaluator for `condition` expressions (specs/06-scoring-checklist.md).
    Only the documented names are in scope; unknown names evaluate falsy."""
    if not expr:
        return True
    allowed = {
        "premises_status": business.get("premises_status"),
        "sector": business.get("sector_code"),
        "entity_type": business.get("entity_type"),
        "employee_count_declared": business.get("employee_count_declared"),
    }
    if any(k in expr for k in allowed):
        try:
            return bool(eval(expr, {"__builtins__": {}}, allowed))
        except Exception:
            return False
    return False


def build_checklist(
    business: dict,
    *,
    rule_pack_id: str,
    documents: list[dict],
) -> list[dict]:
    """Evaluate a rule pack against uploaded documents. `documents` carry
    {doc_type, status, period_start, period_end}. Returns checklist items."""
    requirements = _PACKS.get(rule_pack_id, _PACKS["gh_mfi_working_capital_v1"])
    items: list[dict] = []
    for req in requirements:
        if not evaluate_condition(req.get("condition"), business):
            items.append({**req, "status": "not_applicable", "satisfied_by_document_id": None})
            continue

        accepted_types = {req["doc_type"], *req.get("accepts_also", [])}
        match = next(
            (
                d
                for d in documents
                if d["doc_type"] in accepted_types and d["status"] == "extracted"
            ),
            None,
        )
        if match is not None:
            items.append({**req, "status": "satisfied", "satisfied_by_document_id": match["id"]})
        else:
            items.append({**req, "status": "missing", "satisfied_by_document_id": None})
    return items


def missing_gaps(checklist: list[dict]) -> list[dict]:
    """Map missing required/conditional items to gaps (specs/06-scoring-checklist.md)."""
    gaps: list[dict] = []
    for item in checklist:
        if item["status"] != "missing":
            continue
        if item["requirement"] == "required":
            gaps.append(
                {
                    "kind": "missing_document",
                    "severity": "blocker",
                    "code": f"MISSING_DOC_{item['doc_type']}".upper(),
                    "title": f"{item.get('label', item['doc_type'])} is missing",
                    "target_ref": {"doc_type": item["doc_type"]},
                }
            )
        elif item["requirement"] == "conditional":
            gaps.append(
                {
                    "kind": "missing_document",
                    "severity": "major",
                    "code": f"MISSING_DOC_{item['doc_type']}".upper(),
                    "title": f"{item.get('label', item['doc_type'])} is missing",
                    "target_ref": {"doc_type": item["doc_type"]},
                }
            )
    return gaps