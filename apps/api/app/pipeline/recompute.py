"""Pipeline orchestration for the worker (recompute path).

The full S1-S6 ingestion stages (OCR, parsers, dedup, categorisation) are still
ahead; this module implements what is useful before them: coverage, indicators,
checklist, document gaps and score are derived from whatever transactions /
documents already exist. Re-running is safe (INV-4)-rows are keyed by a
version and replaced, never appended.
"""

import re
import uuid
from datetime import UTC, datetime, date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.business import Account, Business
from app.models.document import Document
from app.models.enums import DocStatus, GapStatus
from app.models.scoring import ChecklistItem, Gap, Indicator, ReadinessScore
from app.models.transaction import Transaction
from app.pipeline import s7_analyse
from app.pipeline import s8_score
from app.pipeline import s9_checklist
from app.pipeline.s3_extract import categorize_transaction
from app.models.enums import CategorySource
from app.services.coverage import build_coverage_sync
from app.services.transaction_mapping import TransactionLabel, get_transaction_categorizer

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
        select(Transaction)
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.business_id == business_id, Document.deleted_at.is_(None))
        .order_by(Transaction.occurred_on)
    ).all()
    eligible_document_ids = {
        document.id for document in documents if _document_is_scoring_eligible(document)
    }
    score_txns = [txn for txn in txns if txn.document_id in eligible_document_ids]

    # Backfill the deterministic S6 rules for rows ingested before the
    # categorization stage was wired into the worker. Human and owner labels
    # always win and are never overwritten by rules.
    for txn in txns:
        if re.search(r"\binternal\b", txn.counterparty_raw or "", re.I):
            txn.flags = {**(txn.flags or {}), "internal_transfer": True}
        if txn.category_source in {CategorySource.HUMAN, CategorySource.OWNER_STATED}:
            continue
        if txn.category_l1 not in (None, "unknown"):
            continue
        category_l1, category_l2, confidence = categorize_transaction(
            txn.counterparty_raw or "", None, txn.direction.value
        )
        if category_l1 is not None:
            txn.category_l1 = category_l1
            txn.category_l2 = category_l2
            txn.category_confidence = confidence
            txn.category_source = CategorySource.RULE
    _apply_model_categories(txns)
    db.flush()

    # ---- Coverage (S5.3) ----
    coverage = build_coverage_sync(db, business_id)
    business.coverage_json = coverage
    db.flush()
    score_coverage = build_coverage_sync(db, business_id, document_ids=eligible_document_ids)

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
    unclassified_ratio = _score_unclassified_ratio(score_txns, window_start, window_end)
    accounts_declared = len(accounts)
    accounts_captured = len({t.account_id for t in score_txns})
    score_documents = [document for document in documents if document.id in eligible_document_ids]
    statement_value = _statement_value_pesewas(score_txns, score_documents)
    total_value = sum(t.amount_pesewas for t in score_txns)
    score_missing_periods = sum(len(account["holes"]) for account in score_coverage["accounts"])

    score_payload = s8_score.compute_score(
        continuous_months=score_coverage["continuous_months"],
        unclassified_ratio=unclassified_ratio,
        accounts_declared=accounts_declared,
        accounts_captured=accounts_captured,
        open_missing_periods=score_missing_periods,
        computable_codes=computable,
        checklist=[_checklist_as_dict(c) for c in checklist_model],
        statement_value_pesewas=statement_value,
        total_value_pesewas=total_value,
    )
    _sync_score(db, business_id, score_payload)

    db.commit()
    return {"business_id": str(business_id), "score": score_payload, "coverage": coverage}


def _apply_model_categories(txns: list[Transaction]) -> None:
    """Use OpenAI only for unresolved, non-internal labels in batches of 50."""
    categorizer = get_transaction_categorizer()
    if categorizer is None:
        return
    grouped: dict[str, list[Transaction]] = {}
    for txn in txns:
        if (txn.flags or {}).get("internal_transfer") or txn.category_l1 not in (None, "unknown"):
            continue
        label = " ".join((txn.counterparty_raw or "Unidentified transaction").split())[:300]
        grouped.setdefault(label, []).append(txn)

    labels = list(grouped.items())
    for offset in range(0, len(labels), 50):
        batch = labels[offset : offset + 50]
        source_map = {
            f"c{offset + index}": transactions
            for index, (_, transactions) in enumerate(batch)
        }
        model_labels = [
            TransactionLabel(
                source_id=source_id,
                label=label,
                direction_mix={
                    direction: sum(transaction.direction.value == direction for transaction in transactions)
                    for direction in ("in", "out")
                },
                transaction_count=len(transactions),
            )
            for source_id, (label, transactions) in zip(source_map, batch, strict=True)
        ]
        for category in categorizer.categorize(model_labels):
            if category.confidence < 0.60 or category.category_l1 == "unknown":
                continue
            for txn in source_map.get(category.source_id, ()):
                txn.category_l1 = category.category_l1
                txn.category_l2 = category.category_l2
                txn.category_confidence = category.confidence
                txn.category_source = CategorySource.LLM


def _document_is_scoring_eligible(document: Document) -> bool:
    review = (document.quality_flags or {}).get("evidence_review")
    # Documents ingested before evidence review existed remain eligible. New
    # documents must explicitly be clear or reviewer-approved.
    return review is None or bool(review.get("scoring_eligible"))


def _score_unclassified_ratio(txns: list[Transaction], window_start: date | None, window_end: date | None) -> float | None:
    if window_start is None or window_end is None:
        return None
    active = [
        txn for txn in txns
        if window_start <= txn.occurred_on <= window_end
        and not (txn.flags or {}).get("duplicate")
        and not (txn.flags or {}).get("internal_transfer")
        and not (txn.flags or {}).get("fx")
        and not (txn.flags or {}).get("reversal")
    ]
    total = sum(txn.amount_pesewas for txn in active)
    return sum(txn.amount_pesewas for txn in active if txn.category_l1 in (None, "unknown")) / total if total else None


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
    if not indicators:
        # A document can be removed after indicators were computed. Do not
        # leave the previous period's analytics visible when no active data
        # remains for this business.
        db.execute(delete(Indicator).where(Indicator.business_id == business_id))
        db.flush()
        return
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
    missing_gaps = s9_checklist.missing_gaps([_checklist_as_dict(c) for c in missing])
    missing_codes = {gap["code"] for gap in missing_gaps}

    # A gap is a derived view of the current checklist. Resolve stale missing
    # document gaps after a later upload satisfies the requirement; otherwise a
    # previously missing bank statement remains visible forever.
    active_missing = db.scalars(
        select(Gap).where(
            Gap.business_id == business_id,
            Gap.kind == "missing_document",
            Gap.code.like("MISSING_DOC_%"),
            Gap.status.in_(_ACTIVE_GAP_STATUSES),
        )
    ).all()
    for existing in active_missing:
        if existing.code not in missing_codes:
            existing.status = GapStatus.RESOLVED
            existing.resolved_at = _now()

    for gap in missing_gaps:
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
