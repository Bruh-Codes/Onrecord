"""Write Paystack payments, refunds, fees and payouts into the one ledger.

Each record keeps Paystack's id as its provider_reference, so reading the same
period twice never adds anything twice (uq_transaction_account_provider_reference).
Rows are provider evidence (processor_statement), with an extraction behind
every transaction (Agent.md INV-7) holding what Paystack said.
"""

import hashlib
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.business import Account
from app.models.document import Document, Extraction
from app.models.enums import AccountKind, CategorySource, Direction, DocStatus, DocType, Provider
from app.models.paystack import PaystackConnection
from app.models.transaction import Transaction
from app.services.paystack.client import PaystackClient

EXTRACTOR = "paystack_api"
CURRENCY = "GHS"
# Paystack can mark a payment successful a little after it started, so each
# sync re-reads this far before where the last one stopped.
OVERLAP = timedelta(days=2)


def account_identifier(connection: PaystackConnection) -> str:
    # One Paystack ledger per business and mode, so reconnecting reuses it and
    # payments already read are recognised instead of added again.
    return hashlib.sha256(f"paystack:{connection.business_id}:{connection.mode}".encode()).hexdigest()


def ensure_ledger(session: Session, connection: PaystackConnection) -> tuple[Account, Document]:
    account = session.get(Account, connection.account_id) if connection.account_id else None
    if account is None:
        identifier = account_identifier(connection)
        account = session.scalar(select(Account).where(
            Account.business_id == connection.business_id, Account.identifier_hash == identifier,
        ))
        if account is None:
            account = Account(
                business_id=connection.business_id, kind=AccountKind.POS, provider=Provider.PAYSTACK,
                identifier_hash=identifier, display_suffix="PSTK", currency=CURRENCY, is_business_use=True,
            )
            session.add(account)
    document = session.get(Document, connection.document_id) if connection.document_id else None
    if document is None or document.deleted_at is not None:
        name = "Paystack (test mode)" if connection.mode == "test" else "Paystack"
        document = Document(
            business_id=connection.business_id, uploaded_by=connection.connected_by,
            storage_key=f"{connection.business_id}/paystack/{connection.id}/{name}",
            sha256=hashlib.sha256(f"onrecord-paystack:{connection.id}:{datetime.now(UTC).isoformat()}".encode()).hexdigest(),
            mime="application/json", page_count=1,
            doc_type=DocType.PROCESSOR_STATEMENT, doc_type_confidence=1, issuer=Provider.PAYSTACK,
            status=DocStatus.EXTRACTED,
            quality_flags={"paystack_sync": {"connection_id": str(connection.id), "mode": connection.mode}},
        )
        session.add(document)
    session.flush()
    connection.account_id, connection.document_id = account.id, document.id
    return account, document


def _when(*values) -> datetime | None:
    for value in values:
        if value:
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                continue
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def _pesewas(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _customer_name(item: dict) -> str | None:
    customer = item.get("customer") or {}
    name = " ".join(part for part in (customer.get("first_name"), customer.get("last_name")) if part)
    return name.strip()[:120] or None


class _Writer:
    def __init__(self, session: Session, connection: PaystackConnection, account: Account, document: Document):
        self.session, self.connection, self.account, self.document = session, connection, account, document
        self.known = set(session.scalars(select(Transaction.provider_reference).where(
            Transaction.account_id == account.id, Transaction.provider_reference.is_not(None),
        )).all())

    def _extraction(self, field_path: str, value: dict) -> Extraction:
        extraction = Extraction(
            document_id=self.document.id, page=1, field_path=field_path, value_json=value,
            extractor=EXTRACTOR, confidence=1,
        )
        self.session.add(extraction)
        self.session.flush()
        return extraction

    def add(self, *, reference: str, kind: str, when: datetime, direction: Direction, amount: int,
            description: str, category: tuple[str, str], source: dict, fee: int = 0, extra_flags: dict | None = None) -> bool:
        if reference in self.known or amount <= 0:
            return False
        extraction = self._extraction(f"paystack.{kind}[{source.get('id')}]", source)
        self.session.add(Transaction(
            business_id=self.connection.business_id, account_id=self.account.id, document_id=self.document.id,
            occurred_on=when.date(), posted_at=when, direction=direction, amount_pesewas=amount, fee_pesewas=fee,
            description=description, provider_reference=reference,
            category_l1=category[0], category_l2=category[1], category_confidence=1, category_source=CategorySource.RULE,
            flags={"from_paystack": True, "paystack": {
                "connection_id": str(self.connection.id), "kind": kind, "mode": self.connection.mode,
                **({"reference": source["reference"]} if source.get("reference") else {}),
            }, **(extra_flags or {})},
            provenance={"extraction_ids": [str(extraction.id)], "value_kind": "extracted"},
        ))
        self.known.add(reference)
        return True

    def refresh_fees(self, day: date) -> None:
        """One "Paystack fees" record per day: the sum of that day's payment fees."""
        total = int(self.session.scalar(select(func.coalesce(func.sum(Transaction.fee_pesewas), 0)).where(
            Transaction.account_id == self.account.id, Transaction.occurred_on == day,
            Transaction.provider_reference.like("txn:%"),
        )) or 0)
        reference = f"fees:{day.isoformat()}"
        row = self.session.scalar(select(Transaction).where(
            Transaction.account_id == self.account.id, Transaction.provider_reference == reference,
        ))
        if row is not None and row.amount_pesewas == total:
            return
        if total <= 0:
            if row is not None:
                self.session.delete(row)
            return
        extraction = self._extraction(f"paystack.fees[{day.isoformat()}]", {"day": day.isoformat(), "fees_pesewas": total})
        if row is None:
            self.session.add(Transaction(
                business_id=self.connection.business_id, account_id=self.account.id, document_id=self.document.id,
                occurred_on=day, direction=Direction.OUT, amount_pesewas=total, description="Paystack fees",
                provider_reference=reference, category_l1="opex", category_l2="bank_charges",
                category_confidence=1, category_source=CategorySource.RULE,
                flags={"from_paystack": True, "paystack": {"connection_id": str(self.connection.id), "kind": "fees", "mode": self.connection.mode}},
                provenance={"extraction_ids": [str(extraction.id)], "value_kind": "derived"},
            ))
            self.known.add(reference)
            return
        previous = (row.provenance or {}).get("extraction_ids", [])
        for old in self.session.scalars(select(Extraction).where(Extraction.id.in_(previous), Extraction.superseded_by.is_(None))):
            old.superseded_by = extraction.id
        row.amount_pesewas = total
        row.provenance = {**(row.provenance or {}), "extraction_ids": [*previous, str(extraction.id)]}


def _payments(writer: _Writer, items: Iterable[dict], fee_days: set[date], result: dict) -> None:
    for item in items:
        if item.get("status") != "success":
            continue
        if (item.get("currency") or CURRENCY).upper() != CURRENCY:
            result["other_currency"] += 1
            continue
        when = _when(item.get("paid_at"), item.get("paidAt"), item.get("created_at"), item.get("createdAt"))
        if when is None:
            continue
        name = _customer_name(item)
        source = {key: item.get(key) for key in ("id", "reference", "amount", "fees", "currency", "channel", "paid_at", "gateway_response")}
        source["customer"] = name
        added = writer.add(
            reference=f"txn:{item.get('id')}", kind="payment", when=when, direction=Direction.IN,
            amount=_pesewas(item.get("amount")), fee=_pesewas(item.get("fees")),
            description=f"Paystack payment from {name}" if name else "Paystack payment",
            category=("revenue", "sales"), source=source,
            extra_flags={"counterparty": name, "payment_method": item.get("channel")} if name else {"payment_method": item.get("channel")},
        )
        if added:
            result["payments"] += 1
            fee_days.add(when.date())


def _refunds(writer: _Writer, items: Iterable[dict], result: dict) -> None:
    for item in items:
        if item.get("status") != "processed":
            continue
        if (item.get("currency") or CURRENCY).upper() != CURRENCY:
            result["other_currency"] += 1
            continue
        when = _when(item.get("refunded_at"), item.get("refundedAt"), item.get("createdAt"), item.get("created_at"))
        if when is None:
            continue
        source = {key: item.get(key) for key in ("id", "amount", "currency", "status", "refunded_at", "createdAt")}
        transaction = item.get("transaction")
        source["transaction"] = transaction.get("id") if isinstance(transaction, dict) else transaction
        if writer.add(reference=f"refund:{item.get('id')}", kind="refund", when=when, direction=Direction.OUT,
                      amount=_pesewas(item.get("amount")), description="Paystack refund to a customer",
                      category=("opex", "refunds"), source=source):
            result["refunds"] += 1


def _payouts(writer: _Writer, items: Iterable[dict], result: dict) -> None:
    for item in items:
        if item.get("status") != "success":
            continue
        if (item.get("currency") or CURRENCY).upper() != CURRENCY:
            result["other_currency"] += 1
            continue
        when = _when(item.get("settlement_date"), item.get("settled_by"), item.get("updatedAt"), item.get("createdAt"))
        if when is None:
            continue
        amount = _pesewas(item.get("effective_amount")) or _pesewas(item.get("total_amount"))
        source = {key: item.get(key) for key in ("id", "total_amount", "effective_amount", "total_fees", "currency", "status", "settlement_date")}
        # Money moving from Paystack to the owner's bank is not spending; it
        # stays out of every total, and is kept to match bank statements later.
        if writer.add(reference=f"payout:{item.get('id')}", kind="payout", when=when, direction=Direction.OUT,
                      amount=amount, description="Paystack payout to your bank",
                      category=("internal", "paystack_payout"), source=source, extra_flags={"internal_transfer": True}):
            result["payouts"] += 1


def sync_connection(session: Session, connection: PaystackConnection, client: PaystackClient, *, now: datetime | None = None) -> dict:
    """Read everything since the last sync and add what's new. Raises PaystackError."""
    now = now or datetime.now(UTC)
    since = (connection.synced_through - OVERLAP) if connection.synced_through else now - timedelta(days=get_settings().paystack_backfill_days)
    account, document = ensure_ledger(session, connection)
    writer = _Writer(session, connection, account, document)
    result = {"payments": 0, "refunds": 0, "payouts": 0, "other_currency": 0}
    fee_days: set[date] = set()
    # Read everything first: a failure part-way leaves nothing half-written.
    payments, refunds, payouts = list(client.transactions(since, now)), list(client.refunds(since, now)), list(client.settlements(since, now))
    _payments(writer, payments, fee_days, result)
    _refunds(writer, refunds, result)
    _payouts(writer, payouts, result)
    session.flush()
    for day in sorted(fee_days):
        writer.refresh_fees(day)
    session.flush()

    first, last = session.execute(select(func.min(Transaction.occurred_on), func.max(Transaction.occurred_on)).where(
        Transaction.document_id == document.id,
    )).one()
    # Paystack is the whole record for this account, so its period runs from
    # the first payment read to today, quiet days included. It never starts
    # before the first record, so a new account can't claim a year of history.
    if first is not None:
        document.period_start = first
        document.period_end = max(last, now.date())

    changed = any(result[key] for key in ("payments", "refunds", "payouts"))
    connection.synced_through = now
    connection.last_checked_at = now
    connection.last_error = None
    if changed or connection.last_synced_at is None:
        connection.last_synced_at = now
    connection.last_result = {**result, "at": now.isoformat()}
    if connection.status == "needs_attention":
        connection.status = "active"
    return {**result, "changed": changed}
