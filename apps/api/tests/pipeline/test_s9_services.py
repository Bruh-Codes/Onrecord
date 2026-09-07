from datetime import date

from app.pipeline import s9_checklist
from app.services.coverage import continuous_months, holes_in, merged_ranges


def test_merged_ranges_touch():
    ranges = [(date(2026, 1, 1), date(2026, 1, 31)), (date(2026, 2, 1), date(2026, 2, 28))]
    merged = merged_ranges(ranges)
    assert len(merged) == 1
    assert merged[0] == (date(2026, 1, 1), date(2026, 2, 28))


def test_holes_under_seven_days_are_ignored():
    ranges = [(date(2026, 1, 1), date(2026, 1, 20)), (date(2026, 1, 25), date(2026, 2, 28))]
    assert holes_in(ranges) == []


def test_holes_seven_plus_days_are_reported():
    ranges = [(date(2026, 1, 1), date(2026, 2, 10)), (date(2026, 3, 1), date(2026, 3, 31))]
    holes = holes_in(ranges)
    assert len(holes) == 1
    assert holes[0] == (date(2026, 2, 11), date(2026, 2, 28))


def test_continuous_months():
    ranges = [(date(2026, 1, 1), date(2026, 6, 30))]
    assert continuous_months(ranges) == 6


def test_checklist_satisfied_by_extracted_document():
    business = {"premises_status": "rented"}
    documents = [
        {"id": "a", "doc_type": "momo_statement", "status": "extracted", "period_start": date(2026, 1, 1), "period_end": date(2026, 6, 30)},
    ]
    items = s9_checklist.build_checklist(business, rule_pack_id="gh_mfi_working_capital_v1", documents=documents)
    by_type = {i["doc_type"]: i for i in items}
    assert by_type["bank_statement"]["status"] == "satisfied"
    assert by_type["registration_cert"]["status"] == "missing"


def test_checklist_conditional_requires_its_own_document():
    business = {"premises_status": "rented"}
    items = s9_checklist.build_checklist(business, rule_pack_id="gh_mfi_working_capital_v1", documents=[])
    tenancy = [i for i in items if i["doc_type"] == "tenancy_agreement"][0]
    assert tenancy["status"] == "missing"


def test_checklist_conditional_not_applicable_when_owned():
    business = {"premises_status": "owned"}
    items = s9_checklist.build_checklist(
        business, rule_pack_id="gh_mfi_working_capital_v1", documents=[]
    )
    tenancy = [i for i in items if i["doc_type"] == "tenancy_agreement"][0]
    assert tenancy["status"] == "not_applicable"


def test_missing_required_produces_blocker_gap():
    requirements = [
        {"doc_type": "registration_cert", "requirement": "required", "status": "missing", "label": "reg cert"},
        {"doc_type": "tenancy_agreement", "requirement": "conditional", "status": "missing", "label": "tenancy"},
        {"doc_type": "stock_list", "requirement": "optional", "status": "missing", "label": "stock"},
    ]
    gaps = s9_checklist.missing_gaps(requirements)
    by_code = {g["code"]: g for g in gaps}
    assert by_code["MISSING_DOC_REGISTRATION_CERT"]["severity"] == "blocker"
    assert by_code["MISSING_DOC_TENANCY_AGREEMENT"]["severity"] == "major"
    assert "MISSING_DOC_STOCK_LIST" not in by_code