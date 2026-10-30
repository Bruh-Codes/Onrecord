"""Records the owner types in, stored as ordinary ledger transactions.

A cash sale or a stock purchase paid in cash is the same kind of fact as a
MoMo payment, so it lives in the one `transaction` ledger and flows into Money,
Business health, Loan readiness and the Lender summary. Typed records hang off
a single cash-book document per business ("Records you typed in"), which the
readiness score already weighs as self-reported evidence (informal_ledger).
"""

import hashlib
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Account
from app.models.document import Document, Extraction
from app.models.enums import AccountKind, CategorySource, Direction, DocStatus, DocType, Provider
from app.models.transaction import Transaction

HAND_ENTERED_FILENAME = "Records you typed in"

# What the money was for, in plain words, mapped to the ledger's category.
# Worded for any small business; farm items are one choice among the others.
MONEY_IN_CATEGORIES = {
    "Sales of goods": "revenue",
    "Payment for a service": "revenue",
    "Farm produce or animal sales": "revenue",
    "Other sales": "revenue",
    "Loan received": "financing_in",
    "Money you put in": "owner",
}
MONEY_OUT_CATEGORIES = {
    "Stock or goods to resell": "cogs",
    "Materials and supplies": "cogs",
    "Farm inputs (seeds, fertiliser, feed)": "cogs",
    "Packaging": "cogs",
    "Wages and labour": "opex",
    "Rent": "opex",
    "Transport": "opex",
    "Fuel, water and power": "opex",
    "Phone and internet": "opex",
    "Equipment and repairs": "opex",
    "Taxes, levies and permits": "tax",
    "Other costs": "opex",
    "Loan repayment": "financing_out",
    "Money you took out": "owner",
}
# Earlier farm-only choices. Still accepted so older clients and saved records
# keep working, but no longer offered in the list.
_LEGACY_IN = {"Produce sales": "revenue", "Animal sales": "revenue"}
_LEGACY_OUT = {
    "Seeds and seedlings": "cogs",
    "Fertilizer and chemicals": "cogs",
    "Feed": "cogs",
    "Animals or fingerlings bought": "cogs",
    "Labour": "opex",
    "Land preparation": "opex",
    "Water and power": "opex",
    "Vet and medicine": "opex",
}


def categories_for(direction: Direction) -> dict[str, str]:
    """Every label a record may carry for this direction, including legacy ones."""
    if direction == Direction.IN:
        return {**MONEY_IN_CATEGORIES, **_LEGACY_IN}
    return {**MONEY_OUT_CATEGORIES, **_LEGACY_OUT}


def clean_tag(value: str | None) -> str | None:
    """Tags are free text; trim and collapse spaces so 'Tomatoes ' groups with 'Tomatoes'."""
    if value is None:
        return None
    cleaned = " ".join(value.split())[:80]
    return cleaned or None


def _book_hash(business_id: uuid.UUID) -> str:
    return hashlib.sha256(f"onrecord-hand-entered:{business_id}".encode()).hexdigest()


async def hand_entry_book(session: AsyncSession, business_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Account, Document]:
    """The cash-book account and document that typed records belong to."""
    identifier_hash = hashlib.sha256(f"hand-entered:{business_id}".encode()).hexdigest()
    account = await session.scalar(select(Account).where(
        Account.business_id == business_id, Account.identifier_hash == identifier_hash,
    ))
    if account is None:
        account = Account(
            business_id=business_id, kind=AccountKind.CASH_BOOK, provider=Provider.OTHER_BANK,
            identifier_hash=identifier_hash, display_suffix="HAND", currency="GHS",
        )
        session.add(account)
    document = await session.scalar(select(Document).where(
        Document.business_id == business_id, Document.sha256 == _book_hash(business_id), Document.deleted_at.is_(None),
    ))
    if document is None:
        document = Document(
            business_id=business_id, uploaded_by=user_id,
            storage_key=f"{business_id}/hand-entered/{HAND_ENTERED_FILENAME}",
            sha256=_book_hash(business_id), mime="text/plain", page_count=1,
            doc_type=DocType.INFORMAL_LEDGER, doc_type_confidence=1, status=DocStatus.EXTRACTED,
            quality_flags={"hand_entered": True},
        )
        session.add(document)
    await session.flush()
    return account, document


async def add_hand_entry(
    session: AsyncSession,
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    direction: Direction,
    occurred_on: date,
    amount_pesewas: int,
    category: str,
    description: str | None = None,
    counterparty: str | None = None,
    farm_activity: str | None = None,
    season: str | None = None,
    extra_flags: dict | None = None,
) -> Transaction:
    account, document = await hand_entry_book(session, business_id, user_id)
    entered = {
        "direction": direction.value, "occurred_on": occurred_on.isoformat(), "amount_pesewas": amount_pesewas,
        "category": category, "description": description, "counterparty": counterparty,
        "entered_by": str(user_id),
    }
    # The typed values are kept append-only, like any other extraction (INV-4, INV-7).
    extraction = Extraction(
        document_id=document.id, page=1, field_path="hand_entry", value_json=entered,
        extractor="owner_typed", confidence=1,
    )
    session.add(extraction)
    await session.flush()
    row = Transaction(
        business_id=business_id, account_id=account.id, document_id=document.id,
        occurred_on=occurred_on, direction=direction, amount_pesewas=amount_pesewas,
        description=description or category,
        category_l1=categories_for(direction)[category], category_l2=category,
        category_confidence=1, category_source=CategorySource.OWNER_STATED,
        farm_activity=clean_tag(farm_activity), season=clean_tag(season),
        flags={
            "hand_entered": True,
            "owner_confirmed": True,
            **({"counterparty": counterparty} if counterparty else {}),
            **(extra_flags or {}),
        },
        provenance={"extraction_ids": [str(extraction.id)], "value_kind": "declared"},
    )
    session.add(row)
    await session.flush()
    return row
