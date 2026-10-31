"""Write synced sheet rows into the one transaction ledger.

Each connection gets its own cash-book account and informal-ledger document,
so its rows are declared records (Agent.md INV-2) with an extraction behind
every transaction (INV-7), the same as records typed into OnRecord.
"""

import hashlib
import re
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Account
from app.models.document import Document, Extraction
from app.models.enums import (
    AccountKind,
    CategorySource,
    Direction,
    DocStatus,
    DocType,
    Provider,
)
from app.models.sheet_sync import SheetConnection, SheetRow
from app.models.transaction import Transaction
from app.services.hand_entries import clean_tag
from app.services.sheet_sync.categories import AUTO_CONFIDENCE, resolve

EXTRACTOR = "google_sheets"
# Categories the owner or a reviewer chose in OnRecord survive sheet edits.
_KEEP_CATEGORY_FROM = (CategorySource.HUMAN,)


def document_filename(connection: SheetConnection) -> str:
    name = re.sub(r"[/\\]+", "-", f"{connection.spreadsheet_name} - {connection.sheet_title}")
    return f"Google Sheet - {name}"[:200]


def ensure_ledger(session: Session, connection: SheetConnection) -> tuple[Account, Document]:
    account = session.get(Account, connection.account_id) if connection.account_id else None
    if account is None:
        account = Account(
            business_id=connection.business_id, kind=AccountKind.CASH_BOOK, provider=Provider.OTHER_BANK,
            identifier_hash=hashlib.sha256(f"sheet:{connection.id}".encode()).hexdigest(),
            display_suffix="SHT", currency="GHS",
        )
        session.add(account)
    document = session.get(Document, connection.document_id) if connection.document_id else None
    if document is None or document.deleted_at is not None:
        document = Document(
            business_id=connection.business_id, uploaded_by=connection.connected_by,
            storage_key=f"{connection.business_id}/sheets/{connection.id}/{document_filename(connection)}",
            sha256=hashlib.sha256(f"onrecord-sheet:{connection.id}:{uuid.uuid4()}".encode()).hexdigest(),
            mime="application/vnd.google-apps.spreadsheet", page_count=1,
            doc_type=DocType.INFORMAL_LEDGER, doc_type_confidence=1, status=DocStatus.EXTRACTED,
            quality_flags={"sheet_sync": {"connection_id": str(connection.id)}},
        )
        session.add(document)
    session.flush()
    connection.account_id, connection.document_id = account.id, document.id
    return account, document


def _extraction(session: Session, document: Document, row: SheetRow) -> Extraction:
    extraction = Extraction(
        document_id=document.id, page=1, field_path=f"sheet_row[{row.row_number}]",
        value_json={"row_number": row.row_number, "values": row.values, "record": row.parsed},
        extractor=EXTRACTOR, confidence=1,
    )
    session.add(extraction)
    session.flush()
    if row.extraction_id:
        previous = session.get(Extraction, row.extraction_id)
        if previous is not None and previous.superseded_by is None:
            previous.superseded_by = extraction.id
    row.extraction_id = extraction.id
    return extraction


def _ledger_fields(record: dict) -> dict:
    direction = Direction(record["direction"])
    category = resolve(direction, record.get("category_text"), record.get("description"))
    confident = category.confidence >= AUTO_CONFIDENCE
    return {
        "occurred_on": date.fromisoformat(record["occurred_on"]),
        "direction": direction,
        "amount_pesewas": record["amount_pesewas"],
        "description": record.get("description") or record.get("category_text") or record.get("counterparty") or "Sheet record",
        "category_l1": category.category_l1 if confident else "unknown",
        "category_l2": category.label if confident else None,
        "category_confidence": category.confidence if confident else None,
        "category_source": category.source if confident else None,
        "farm_activity": clean_tag(record.get("product")),
    }


def _row_flags(connection: SheetConnection, row: SheetRow, record: dict) -> dict:
    return {
        "from_sheet": True,
        "sheet": {
            "connection_id": str(connection.id), "row_id": str(row.id),
            "spreadsheet_name": connection.spreadsheet_name, "row_number": row.row_number,
            "initial_import": row.initial_import,
        },
        **{key: record[key] for key in ("counterparty", "payment_method", "reference") if record.get(key)},
    }


def record_row(session: Session, connection: SheetConnection, row: SheetRow) -> Transaction:
    account, document = ensure_ledger(session, connection)
    extraction = _extraction(session, document, row)
    record = row.parsed or {}
    transaction = Transaction(
        business_id=connection.business_id, account_id=account.id, document_id=document.id,
        **_ledger_fields(record),
        flags=_row_flags(connection, row, record),
        provenance={"extraction_ids": [str(extraction.id)], "value_kind": "declared"},
    )
    session.add(transaction)
    session.flush()
    row.transaction_id = transaction.id
    row.status, row.review_reason = "recorded", None
    return transaction


def apply_edit(session: Session, connection: SheetConnection, row: SheetRow) -> Transaction:
    """Bring the ledger in line with an edited row and keep what it said before."""
    transaction = session.get(Transaction, row.transaction_id) if row.transaction_id else None
    if transaction is None:
        return record_row(session, connection, row)
    _, document = ensure_ledger(session, connection)
    before = snapshot(transaction)
    extraction = _extraction(session, document, row)
    fields = _ledger_fields(row.parsed or {})
    if transaction.category_source in _KEEP_CATEGORY_FROM:
        for key in ("category_l1", "category_l2", "category_confidence", "category_source"):
            fields.pop(key)
    for key, value in fields.items():
        setattr(transaction, key, value)
    flags = {**(transaction.flags or {}), **_row_flags(connection, row, row.parsed or {})}
    flags["sheet_edits"] = [
        *(transaction.flags or {}).get("sheet_edits", []),
        {"at": datetime.now(UTC).isoformat(), "before": before, "after": snapshot(transaction)},
    ][-20:]
    transaction.flags = flags
    extraction_ids = [*(transaction.provenance or {}).get("extraction_ids", []), str(extraction.id)]
    transaction.provenance = {**(transaction.provenance or {}), "extraction_ids": extraction_ids}
    row.status, row.review_reason = "recorded", None
    return transaction


def remove_record(session: Session, row: SheetRow) -> None:
    """The row left the sheet: take it out of every total, keep it in history."""
    transaction = session.get(Transaction, row.transaction_id) if row.transaction_id else None
    if transaction is not None:
        row.history = [*(row.history or []), {
            "event": "removed_from_ledger", "at": datetime.now(UTC).isoformat(), "record": snapshot(transaction),
        }]
        session.delete(transaction)
    row.transaction_id = None


def snapshot(transaction: Transaction) -> dict:
    return {
        "occurred_on": transaction.occurred_on.isoformat() if transaction.occurred_on else None,
        "direction": transaction.direction.value if transaction.direction else None,
        "amount_pesewas": transaction.amount_pesewas,
        "description": transaction.description,
        "category": transaction.category_l2 or transaction.category_l1,
    }


def hand_entered_match(session: Session, business_id: uuid.UUID, record: dict) -> Transaction | None:
    """A record the owner typed into OnRecord that this sheet row may repeat."""
    return session.scalar(select(Transaction).where(
        Transaction.business_id == business_id,
        Transaction.occurred_on == date.fromisoformat(record["occurred_on"]),
        Transaction.direction == Direction(record["direction"]),
        Transaction.amount_pesewas == record["amount_pesewas"],
        Transaction.flags["hand_entered"].as_boolean().is_(True),
    ).limit(1))
