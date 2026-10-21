"""Permission-independent record operations; routers authorize the business first."""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.errors import AppError, not_found
from app.models.agriculture import Enterprise, FarmEntry, FarmKind, ProductionCycle
from app.models.document import Document
from app.models.enums import DocStatus
from app.models.transaction import Transaction
from app.schemas.agriculture import EntryOut, EntryWrite
from app.services.farm_taxonomy import OVERHEAD_CATEGORIES, TEMPLATES


def attachment_available(document):
    return bool(document and not document.deleted_at and (
        (document.quality_flags or {}).get("upload_confirmed") is True
        or document.docling_document is not None
        or document.status == DocStatus.EXTRACTED
    ))


async def enterprise_for(session, business_id, enterprise_id):
    row = await session.scalar(select(Enterprise).where(Enterprise.id == enterprise_id, Enterprise.business_id == business_id))
    if row is None:
        raise not_found("ENTERPRISE_NOT_FOUND", "Select an enterprise in this business.")
    return row


async def validate_scope(session, business_id, enterprise_id=None, cycle_id=None):
    enterprise = await enterprise_for(session, business_id, enterprise_id) if enterprise_id else None
    if cycle_id:
        cycle = await session.scalar(select(ProductionCycle).where(ProductionCycle.id == cycle_id, ProductionCycle.business_id == business_id))
        if cycle is None or (enterprise_id and cycle.enterprise_id != enterprise_id):
            raise not_found("CYCLE_NOT_FOUND", "Select a cycle belonging to this enterprise and business.")
    return enterprise


async def prepare_entry(session: AsyncSession, business_id: uuid.UUID, body: EntryWrite, entry_id=None) -> dict:
    enterprise = await validate_scope(session, business_id, body.enterprise_id, body.cycle_id)
    allowed = OVERHEAD_CATEGORIES if body.shared_overhead else TEMPLATES[enterprise.type.value][body.kind.value]
    if body.category not in allowed:
        raise AppError("INVALID_CATEGORY", "Choose a category for this enterprise and entry type.", 422)
    if body.evidence_document_id:
        document = await session.scalar(select(Document).where(
            Document.id == body.evidence_document_id, Document.business_id == business_id, Document.deleted_at.is_(None),
        ))
        if document is None:
            raise not_found("EVIDENCE_NOT_FOUND", "Choose an active document in this business.")
        if not attachment_available(document):
            raise AppError("UPLOAD_PENDING", "Complete the document upload before linking it as evidence.", 422)
    values = body.model_dump(exclude={"currency"})
    if body.source_transaction_id:
        # Serialize allocations of a source and re-check uniqueness under the lock.
        source = await session.scalar(select(Transaction).join(Document).where(
            Transaction.id == body.source_transaction_id,
            Transaction.business_id == business_id, Document.deleted_at.is_(None), Document.status == DocStatus.EXTRACTED,
        ).with_for_update(of=Transaction))
        if source is None:
            raise not_found("SOURCE_NOT_FOUND", "Choose an active transaction in this business.")
        if any((source.flags or {}).get(flag) for flag in ("duplicate", "internal_transfer", "fx", "reversal")):
            raise AppError("EXCLUDED_SOURCE", "Excluded transactions cannot be allocated to farm activity.", 422)
        kind = FarmKind.INCOME if source.direction.value == "in" else FarmKind.EXPENSE
        operating = source.category_l1 == "revenue" if kind == FarmKind.INCOME else source.category_l1 in {"cogs", "opex", "tax"}
        if not operating or body.kind != kind:
            raise AppError("NON_OPERATING_SOURCE", "Only classified farm receipts and operating costs can be allocated.", 422)
        duplicate = await session.scalar(select(FarmEntry.id).where(
            FarmEntry.source_transaction_id == source.id, FarmEntry.deleted_at.is_(None),
            FarmEntry.id != entry_id if entry_id else True,
        ))
        if duplicate:
            raise AppError("SOURCE_ALREADY_ALLOCATED", "This source is already counted. Edit its existing farm entry.", 409)
        values.update(occurred_on=source.occurred_on, amount_pesewas=None)
    if body.cycle_id:
        cycle = await session.get(ProductionCycle, body.cycle_id)
        if values["occurred_on"] < cycle.start_date or (cycle.end_date and values["occurred_on"] > cycle.end_date):
            raise AppError("DATE_OUTSIDE_CYCLE", "The transaction date must fall within the selected cycle.", 422)
    return values


async def load_entries(session, business_id, enterprise_id=None, cycle_id=None, from_date=None, to_date=None):
    source_doc, evidence_doc = aliased(Document), aliased(Document)
    query = (
        select(FarmEntry, Transaction, source_doc, evidence_doc, Enterprise.name)
        .outerjoin(Transaction, FarmEntry.source_transaction_id == Transaction.id)
        .outerjoin(source_doc, Transaction.document_id == source_doc.id)
        .outerjoin(evidence_doc, FarmEntry.evidence_document_id == evidence_doc.id)
        .outerjoin(Enterprise, FarmEntry.enterprise_id == Enterprise.id)
        .where(FarmEntry.business_id == business_id, FarmEntry.deleted_at.is_(None))
    )
    if enterprise_id:
        query = query.where(FarmEntry.enterprise_id == enterprise_id)
    if cycle_id:
        query = query.where(FarmEntry.cycle_id == cycle_id)
    rows = (await session.execute(query.order_by(FarmEntry.occurred_on.desc(), FarmEntry.id.desc()))).all()
    entries = []
    for entry, source, source_document, evidence, enterprise_name in rows:
        if entry.source_transaction_id:
            if not source or source.business_id != business_id or not source_document or source_document.deleted_at or source_document.status != DocStatus.EXTRACTED:
                continue
            if any((source.flags or {}).get(flag) for flag in ("duplicate", "internal_transfer", "fx", "reversal")):
                continue
            allowed = source.category_l1 == "revenue" if source.direction.value == "in" else source.category_l1 in {"cogs", "opex", "tax"}
            if not allowed:
                continue
        occurred_on = source.occurred_on if source else entry.occurred_on
        if (from_date and occurred_on < from_date) or (to_date and occurred_on > to_date):
            continue
        active_evidence = evidence if evidence and evidence.business_id == business_id and attachment_available(evidence) else None
        active_evidence = active_evidence or source_document
        entries.append(EntryOut(
            id=entry.id, business_id=business_id, enterprise_id=entry.enterprise_id, enterprise_name=enterprise_name,
            cycle_id=entry.cycle_id, shared_overhead=entry.shared_overhead,
            kind=(FarmKind.INCOME if source.direction.value == "in" else FarmKind.EXPENSE) if source else entry.kind,
            occurred_on=occurred_on, amount_pesewas=source.amount_pesewas if source else entry.amount_pesewas,
            fee_pesewas=source.fee_pesewas if source else 0, levy_pesewas=source.levy_pesewas if source else 0,
            category=entry.category, description=entry.description,
            value_kind="extracted" if source else "declared", source_transaction_id=entry.source_transaction_id,
            evidence_document_id=active_evidence.id if active_evidence else None,
            evidence_status="attached" if active_evidence else "none", updated_at=entry.updated_at,
        ))
    return entries


def entry_snapshot(entry):
    result = {}
    for column in FarmEntry.__table__.columns:
        value = getattr(entry, column.name)
        if isinstance(value, (date, datetime)):
            value = value.isoformat()
        elif isinstance(value, uuid.UUID):
            value = str(value)
        result[column.name] = value
    return result


def now():
    return datetime.now(UTC)
