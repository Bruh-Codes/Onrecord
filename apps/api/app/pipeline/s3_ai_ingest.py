"""Stage Claude's reading of a document and turn confirmed rows into transactions.

Rows are first stored as append-only ``extraction`` rows (INV-4). They become
``transaction`` rows only once they are confirmed: automatically when the
statement's balances reconcile, otherwise when the owner reviews them. Every
transaction keeps a pointer to the extraction it came from (INV-7).
"""

import hashlib
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.business import Account
from app.models.document import Document, Extraction
from app.models.enums import AccountKind, CategorySource, DocStatus, DocType, Provider
from app.models.transaction import Transaction
from app.pipeline.s3_ai_normalise import NormalizedRow, Reconciliation, normalize_rows, reconcile, signed_balance
from app.services.document_reader import DocumentReading
from app.services.evidence_review import EvidenceFinding, EvidenceReview

EXTRACTOR = "claude:document_reader_v1"
OWNER_CORRECTION = "owner:review_correction_v1"
FIELD_PREFIX = "ai_transactions["
MIN_AUTO_CONFIRM_CONFIDENCE = 0.7
_MOMO_TYPES = {DocType.MOMO_STATEMENT, DocType.MOMO_MERCHANT_STATEMENT}
_PROVIDER_ALIASES = (
    ("mtn", Provider.MTN), ("momo", Provider.MTN), ("telecel", Provider.TELECEL), ("vodafone", Provider.TELECEL),
    ("airtel", Provider.AT), ("tigo", Provider.AT), ("at money", Provider.AT), ("gcb", Provider.GCB),
    ("fidelity", Provider.FIDELITY), ("absa", Provider.ABSA), ("barclays", Provider.ABSA),
    ("stanbic", Provider.STANBIC), ("ecobank", Provider.ECOBANK), ("consolidated", Provider.CBG), ("cbg", Provider.CBG),
)


def stage_reading(session: Session, doc: Document, reading: DocumentReading) -> bool:
    """Store the reading on the document. Returns True when rows were auto-confirmed."""
    rows, rejected = normalize_rows(reading)
    reconciliation = reconcile(rows, reading.opening_balance, reading.closing_balance)
    provider = provider_from_text(reading.provider)

    doc.doc_type = DocType(reading.doc_type)
    doc.doc_type_confidence = round(reading.confidence, 2)
    doc.issuer = provider
    dates = sorted(row.occurred_on for row in rows)
    doc.period_start = _parse_date(reading.period_start) or (dates[0] if dates else None)
    doc.period_end = _parse_date(reading.period_end) or (dates[-1] if dates else None)
    doc.status = DocStatus.EXTRACTED

    for index, row in enumerate(rows):
        session.add(Extraction(
            document_id=doc.id,
            page=row.page,
            field_path=f"{FIELD_PREFIX}{index}]",
            value_json=row.as_json(),
            extractor=f"{EXTRACTOR}:{reading.model}",
            confidence=round(reading.confidence, 2),
        ))
    session.flush()

    auto_confirm = (
        get_settings().ai_ingest_auto_confirm_reconciled
        and bool(rows)
        and reconciliation.status == "reconciled"
        and reading.confidence >= MIN_AUTO_CONFIRM_CONFIDENCE
        and not reading.truncated
        and rejected == 0
    )
    flags = {**(doc.quality_flags or {})}
    flags["ai_ingest"] = {
        "state": "needs_review" if rows and not auto_confirm else ("confirmed" if rows else "no_transactions"),
        "model": reading.model,
        "confidence": reading.confidence,
        "summary": reading.summary,
        "findings": list(reading.findings),
        "reconciliation": reconciliation.as_json(),
        "row_count": len(rows),
        "rejected_rows": rejected,
        "truncated": reading.truncated,
        "chunks": reading.chunks,
        "provider": reading.provider,
        "account_label": reading.account_label,
        "currency": reading.currency,
        "opening_balance_pesewas": signed_balance(reading.opening_balance),
        "closing_balance_pesewas": signed_balance(reading.closing_balance),
    }
    flags["supported"] = True
    flags.pop("interpretation_pending", None)
    doc.quality_flags = flags
    _record_review(doc, ai_evidence_review(reconciliation, reading, rejected, owner_confirmed=False))

    if auto_confirm:
        commit_staged_rows(session, doc, confirmed_by=None)
    return auto_confirm


def commit_staged_rows(session: Session, doc: Document, *, confirmed_by: uuid.UUID | None) -> dict:
    """Create transactions from the document's current (non-superseded) staged rows."""
    staged = list(session.scalars(
        select(Extraction).where(
            Extraction.document_id == doc.id,
            Extraction.superseded_by.is_(None),
            Extraction.field_path.like(f"{FIELD_PREFIX}%"),
        ).order_by(Extraction.created_at, Extraction.field_path)
    ))
    included = [(extraction, NormalizedRow.from_json(_row_fields(extraction.value_json)))
                for extraction in staged if not extraction.value_json.get("excluded")]
    meta = (doc.quality_flags or {}).get("ai_ingest", {})
    account = _account_for(session, doc, meta)
    created, duplicates = _insert_transactions(session, doc, account, included, confirmed_by)

    flags = {**(doc.quality_flags or {})}
    flags["ai_ingest"] = {
        **meta,
        "state": "confirmed",
        "confirmed_at": datetime.now(UTC).isoformat(),
        "confirmed_by": str(confirmed_by) if confirmed_by else "auto:reconciled",
        "transactions_created": created,
        "duplicates_skipped": duplicates,
        "excluded_rows": len(staged) - len(included),
    }
    doc.quality_flags = flags
    if confirmed_by is not None:
        reconciliation = Reconciliation(**meta.get("reconciliation", {})) if meta.get("reconciliation") else None
        _record_review(doc, owner_confirmed_review(reconciliation, meta))
    return {"transactions_created": created, "duplicates_skipped": duplicates}


def _row_fields(value: dict) -> dict:
    return {key: value[key] for key in NormalizedRow.__dataclass_fields__}


def _insert_transactions(
    session: Session,
    doc: Document,
    account: Account,
    rows: list[tuple[Extraction, NormalizedRow]],
    confirmed_by: uuid.UUID | None,
) -> tuple[int, int]:
    existing = session.execute(
        select(Transaction.provider_reference, Transaction.occurred_on, Transaction.direction,
               Transaction.amount_pesewas, Transaction.balance_after_pesewas,
               Document.deleted_at.is_(None).label("active"))
        .join(Document, Transaction.document_id == Document.id)
        .where(Transaction.account_id == account.id)
    ).all()
    active = [row for row in existing if row.active]
    references = {row.provider_reference for row in active if row.provider_reference}
    # provider_reference is unique per account even for soft-deleted
    # documents, so a re-upload keeps colliding references in flags only.
    taken_references = {row.provider_reference for row in existing if row.provider_reference}
    fingerprints = {
        (row.occurred_on, row.direction.value, row.amount_pesewas, row.balance_after_pesewas)
        for row in active if row.balance_after_pesewas is not None
    }
    created = duplicates = 0
    for extraction, row in rows:
        fingerprint = (row.occurred_on, row.direction, row.amount_pesewas, row.balance_after_pesewas)
        if (row.reference and row.reference in references) or (
            row.balance_after_pesewas is not None and fingerprint in fingerprints
        ):
            # Overlapping statements (MTN caps each at 90 days) repeat rows.
            duplicates += 1
            continue
        stored_reference = row.reference if row.reference and row.reference not in taken_references else None
        if row.reference:
            references.add(row.reference)
            taken_references.add(row.reference)
        if row.balance_after_pesewas is not None:
            fingerprints.add(fingerprint)
        session.add(Transaction(
            business_id=doc.business_id,
            account_id=account.id,
            document_id=doc.id,
            occurred_on=row.occurred_on,
            direction=row.direction,
            amount_pesewas=row.amount_pesewas,
            fee_pesewas=row.fee_pesewas,
            levy_pesewas=row.levy_pesewas,
            balance_after_pesewas=row.balance_after_pesewas,
            description=row.description or None,
            provider_reference=stored_reference,
            category_l1=None if row.category_l1 == "unknown" else row.category_l1,
            category_confidence=None if row.category_l1 == "unknown" else 0.7,
            category_source=None if row.category_l1 == "unknown" else CategorySource.LLM,
            flags={
                "ai_extracted": True,
                "source_ref": row.source_ref,
                **({"reference": row.reference} if row.reference else {}),
                **({"counterparty": row.counterparty} if row.counterparty else {}),
                **({"owner_confirmed": True} if confirmed_by else {}),
                **({"internal_transfer": True} if row.category_l1 == "internal" else {}),
            },
            provenance={"extraction_ids": [str(extraction.id)]},
        ))
        created += 1
    session.flush()
    return created, duplicates


def _account_for(session: Session, doc: Document, meta: dict) -> Account:
    provider = doc.issuer or Provider.OTHER_BANK
    label = "".join(ch for ch in str(meta.get("account_label") or "") if ch.isalnum())[-4:]
    # Without a printed number, statements from one provider share an account
    # so period stitching and dedupe still work across uploads.
    identifier = f"{provider.value}:{label or 'unlabelled'}"
    identifier_hash = hashlib.sha256(identifier.encode("utf-8")).hexdigest()
    account = session.scalar(
        select(Account).where(Account.business_id == doc.business_id, Account.identifier_hash == identifier_hash)
    )
    if account is None:
        if doc.doc_type == DocType.INFORMAL_LEDGER:
            kind = AccountKind.CASH_BOOK
        elif doc.doc_type in _MOMO_TYPES or provider in {Provider.MTN, Provider.TELECEL, Provider.AT}:
            kind = AccountKind.MOMO
        else:
            kind = AccountKind.BANK
        account = Account(
            business_id=doc.business_id,
            kind=kind,
            provider=provider,
            identifier_hash=identifier_hash,
            display_suffix=label or "----",
            currency=(meta.get("currency") or "GHS")[:3].upper(),
        )
        session.add(account)
        session.flush()
    return account


def provider_from_text(value: str | None) -> Provider:
    lowered = (value or "").lower()
    if lowered.strip() == "at":
        return Provider.AT
    for alias, provider in _PROVIDER_ALIASES:
        if alias in lowered:
            return provider
    return Provider.OTHER_BANK


def ai_evidence_review(
    reconciliation: Reconciliation, reading: DocumentReading, rejected: int, *, owner_confirmed: bool
) -> EvidenceReview:
    findings = [EvidenceFinding("READER_NOTE", "low", note, "document") for note in reading.findings[:10]]
    if rejected:
        findings.append(EvidenceFinding("ROWS_UNREADABLE", "medium", f"{rejected} row(s) could not be read cleanly.", "extraction"))
    if reading.truncated:
        findings.append(EvidenceFinding("READ_TRUNCATED", "high", "The document was too long to read in full.", "extraction"))
    input_hash = hashlib.sha256(repr(reading.rows).encode("utf-8")).hexdigest()
    if reconciliation.status == "reconciled" and not reading.truncated:
        return EvidenceReview("clear", "low", True, reconciliation.note, tuple(findings), reading.model, input_hash)
    severity = "high" if reconciliation.status == "balance_breaks" else "medium"
    findings.insert(0, EvidenceFinding("BALANCE_CHECK", severity, reconciliation.note, "reconciliation"))
    status = "error" if reconciliation.status == "balance_breaks" else "warning"
    summary = "Rows are visible in insights but held out of readiness scoring until reviewed."
    return EvidenceReview(status, severity, False, summary, tuple(findings), reading.model, input_hash)


def owner_confirmed_review(reconciliation: Reconciliation | None, meta: dict) -> EvidenceReview:
    """Owner confirmation makes rows usable but is not independent verification."""
    if reconciliation is not None and reconciliation.status == "reconciled":
        return EvidenceReview("clear", "low", True, "Balances reconcile and the owner confirmed the rows.", (),
                              meta.get("model"), "owner-confirmed")
    note = reconciliation.note if reconciliation else "No balance check was possible."
    return EvidenceReview(
        "warning", "medium", False,
        "The owner confirmed these rows. A reviewer must approve them before they count toward readiness.",
        (EvidenceFinding("BALANCE_CHECK", "medium", note, "reconciliation"),),
        meta.get("model"), "owner-confirmed",
    )


def _record_review(doc: Document, review: EvidenceReview) -> None:
    flags = {**(doc.quality_flags or {})}
    review_dict = review.as_dict()
    flags["evidence_review"] = review_dict
    flags["evidence_review_history"] = [*flags.get("evidence_review_history", []), review_dict][-20:]
    doc.quality_flags = flags


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None
