"""Pipeline orchestration for the worker (recompute path).

The full S1-S6 ingestion stages (OCR, parsers, dedup, categorisation) are still
ahead; this module implements what is useful before them: coverage, indicators,
checklist, document gaps and score are derived from whatever transactions /
documents already exist. Re-running is safe (INV-4)-rows are keyed by a
version and replaced, never appended.
"""

import uuid
from datetime import UTC, datetime, date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Account, Business
from app.models.document import Document
from app.models.enums import DocStatus, GapStatus
from app.models.scoring import ChecklistItem, Gap, Indicator, ReadinessScore
from app.models.transaction import Transaction
from app.pipeline import s7_analyse
from app.pipeline import s8_score
from app.pipeline import s9_checklist
from app.services.coverage import build_coverage_sync

RULE_PACK_ID = "gh_mfi_working_capital_v1"
_ACTIVE_GAP_STATUSES = [GapStatus.OPEN, GapStatus.ANSWERED, GapStatus.DOCUMENT_RECEIVED]


def recompute_business(db: Session, business_id: uuid.UUID) -> dict:
    """Recompute coverage, indicators, checklist, gaps and score for a business."""
    business = db.get(Business, business_id)
    if business is None:
        raise ValueError(f"business {business_id} not found")

    accounts = db.scalars(select(Account).where(Account.business_id == business_id)).all()
    documents = db.scalars(
        select(Document).where(Document.business_id == business_id, Document.deleted_at.is_(None))
    ).all()
    txns = db.scalars(
        select(Transaction).where(Transaction.business_id == business_id).order_by(Transaction.occurred_on)
    ).all()

    # ---- Coverage (S5.3) ----
    coverage = build_coverage_sync(db, business_id)
    business.coverage_json = coverage
    db.flush()

    # ---- Indicators (S7) ----
    window_start = _parse_date(coverage["analysis_window"]["from"])
    window_end = _parse_date(coverage["analysis_window"]["to"])
    indicators: list[dict] = []
    computable: set[str] = set()
    if window_start is not None and window_end is not None:
        analysis_txns = [
            s7_analyse.Txn(
                id=t.id,
                account_id=t.account_id,
                occurred_on=t.occurred_on,
                direction=t.direction.value,
                amount_pesewas=t.amount_pesewas,
                category_l1=t.category_l1,
                category_l2=t.category_l2,
                balance_after_pesewas=t.balance_after_pesewas,
                flags=t.flags,
            )
            for t in txns
        ]
        ctx = s7_analyse.AnalysisContext(
            business_id=business_id, window_start=window_start, window_end=window_end, txns=analysis_txns
        )
        indicators = s7_analyse.compute_indicators(ctx)
        computable = {i["code"] for i in indicators if i["value_json"].get("status") != "insufficient_data"}
    _sync_indicators(db, business_id, window_start, window_end, indicators)

    # ---- Checklist + document gaps (S9) ----
    checklist_model = _sync_checklist(db, business, documents)
    _sync_missing_document_gaps(db, business_id, checklist_model)

    # ---- Coverage gaps (S5.3) ----
    open_period_gaps = _sync_missing_period_gaps(db, business_id, coverage)

    # ---- Score (S8) ----
    unclassified_ratio = _indicator_float(indicators, "UNCLASSIFIED_RATIO")
    accounts_declared = len(accounts)
    accounts_captured = len({t.account_id for t in txns})
    statement_value = _statement_value_pesewas(txns, documents)
    total_value = sum(t.amount_pesewas for t in txns)

    score_payload = s8_score.compute_score(
        continuous_months=coverage["continuous_months"],
        unclassified_ratio=unclassified_ratio,
        accounts_declared=accounts_declared,
        accounts_captured=accounts_captured,
        open_missing_periods=open_period_gaps,
        computable_codes=computable,
        checklist=[_checklist_as_dict(c) for c in checklist_model],
        statement_value_pesewas=statement_value,
        total_value_pesewas=total_value,
    )
    _sync_score(db, business_id, score_payload)

    db.commit()
    return {"business_id": str(business_id), "score": score_payload, "coverage": coverage}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _now() -> datetime:
    return datetime.now(UTC)


def _parse_date(value) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _indicator_float(indicators: list[dict], code: str) -> float | None:
    for i in indicators:
        if i["code"] == code and i["value_json"].get("status") != "insufficient_data":
            v = i["value_json"].get("v")
            return float(v) if v is not None else None
    return None


def _statement_value_pesewas(txns: list[Transaction], documents: list[Document]) -> int:
    statement_docs = {
        d.id
        for d in documents
        if d.doc_type in ("bank_statement", "momo_statement", "momo_merchant_statement")
        and d.status == DocStatus.EXTRACTED
    }
    return sum(t.amount_pesewas for t in txns if t.document_id in statement_docs)


def _sync_indicators(
    db: Session,
    business_id: uuid.UUID,
    window_start: date | None,
    window_end: date | None,
    indicators: list[dict],
) -> None:
    for payload in indicators:
        existing = db.scalar(
            select(Indicator).where(
                Indicator.business_id == business_id,
                Indicator.code == payload["code"],
                Indicator.formula_version == payload["formula_version"],
            )
        )
        row = existing or Indicator(business_id=business_id)
        row.code = payload["code"]
        row.period_start = window_start
        row.period_end = window_end
        row.value_json = payload["value_json"]
        row.unit = payload["unit"]
        row.formula_version = payload["formula_version"]
        row.inputs = payload["inputs"]
        row.computed_at = _now()
        db.add(row)
    db.flush()


def _sync_checklist(db: Session, business: Business, documents: list[Document]) -> list[ChecklistItem]:
    business_dict = {
        "premises_status": business.premises_status,
        "sector_code": business.sector_code,
        "entity_type": business.entity_type.value if business.entity_type else None,
        "employee_count_declared": business.employee_count_declared,
    }
    doc_dicts = [
        {
            "id": d.id,
            "doc_type": d.doc_type.value if d.doc_type else None,
            "status": d.status.value,
            "period_start": d.period_start,
            "period_end": d.period_end,
        }
        for d in documents
    ]
    items = s9_checklist.build_checklist(business_dict, rule_pack_id=RULE_PACK_ID, documents=doc_dicts)

    existing = db.scalars(
        select(ChecklistItem).where(
            ChecklistItem.business_id == business.id, ChecklistItem.rule_pack_id == RULE_PACK_ID
        )
    ).all()
    existing_by_type = {c.doc_type: c for c in existing}

    result: list[ChecklistItem] = []
    for item in items:
        row = existing_by_type.get(item["doc_type"])
        if row is None:
            row = ChecklistItem(business_id=business.id, rule_pack_id=RULE_PACK_ID, doc_type=item["doc_type"])
        row.requirement = item["requirement"]
        row.condition_expr = item.get("condition")
        row.constraint_json = item.get("constraint")
        row.status = item["status"]
        row.satisfied_by_document_id = item["satisfied_by_document_id"]
        db.add(row)
        result.append(row)
    db.flush()
    return result


def _checklist_as_dict(item: ChecklistItem) -> dict:
    return {
        "requirement": item.requirement,
        "status": item.status,
        "doc_type": item.doc_type,
    }


def _sync_missing_document_gaps(db: Session, business_id: uuid.UUID, checklist: list[ChecklistItem]) -> None:
    missing = [c for c in checklist if c.status == "missing"]
    for gap in s9_checklist.missing_gaps([_checklist_as_dict(c) for c in missing]):
        exists = db.scalar(
            select(Gap).where(
                Gap.business_id == business_id,
                Gap.code == gap["code"],
                Gap.status.in_(_ACTIVE_GAP_STATUSES),
            )
        )
        if exists is None:
            db.add(Gap(business_id=business_id, **gap))
    db.flush()


def _sync_missing_period_gaps(db: Session, business_id: uuid.UUID, coverage: dict) -> int:
    """Raise a `missing_period` gap for every hole >= 7 days inside the window.
    Returns the number of currently-open missing-period gaps."""
    added = 0
    for account in coverage["accounts"]:
        for hole in account["holes"]:
            code = "MISSING_PERIOD_STMT"
            exists = db.scalar(
                select(Gap).where(
                    Gap.business_id == business_id,
                    Gap.code == code,
                    Gap.status.in_(_ACTIVE_GAP_STATUSES),
                )
            )
            if exists is None:
                db.add(
                    Gap(
                        business_id=business_id,
                        kind="missing_period",
                        severity="major",
                        code=code,
                        title=f"Statement coverage gap: {hole['from']} – {hole['to']}",
                        detail=(
                            f"Request a statement covering {hole['from']} to {hole['to']} from your provider "
                            "and upload it here promptly-statements expire 24 hours after generation."
                        ),
                        target_ref={"account_id": account["account_id"], "from": hole["from"], "to": hole["to"]},
                    )
                )
                added += 1
    db.flush()

    open_count = db.scalars(
        select(Gap).where(
            Gap.business_id == business_id,
            Gap.kind == "missing_period",
            Gap.status.in_(_ACTIVE_GAP_STATUSES),
        )
    ).all()
    return len(open_count)


def _sync_score(db: Session, business_id: uuid.UUID, payload: dict) -> None:
    existing = db.scalar(
        select(ReadinessScore).where(
            ReadinessScore.business_id == business_id,
            ReadinessScore.rubric_version == payload["rubric_version"],
        )
    )
    row = existing or ReadinessScore(business_id=business_id)
    row.computed_at = _now()
    row.rubric_version = payload["rubric_version"]
    row.total = payload["total"]
    row.band = payload["band"]
    row.pillars = payload["pillars"]
    row.contributions = payload["contributions"]
    db.add(row)
    db.flush()