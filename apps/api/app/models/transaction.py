import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import CategorySource, CounterpartyKind, Direction


class Transaction(IdMixin, Base):
    """amount_pesewas is always positive; sign is carried by `direction` (INV-1).
    provenance.extraction_ids must be non-empty (INV-7) — enforced in the
    Pydantic schema / service layer, not by Postgres, since a portable
    "non-empty jsonb array" check constraint isn't worth the complexity here."""

    __tablename__ = "transaction"
    __table_args__ = (
        CheckConstraint("amount_pesewas > 0", name="ck_transaction_amount_positive"),
        UniqueConstraint(
            "account_id",
            "provider_reference",
            name="uq_transaction_account_provider_reference",
        ),
        Index("ix_transaction_business_occurred", "business_id", "occurred_on"),
        Index("ix_transaction_account_occurred_amount", "account_id", "occurred_on", "amount_pesewas"),
        Index("ix_transaction_business_category", "business_id", "category_l1"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("account.id"), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"), nullable=False)

    occurred_on: Mapped[date] = mapped_column(nullable=False)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    direction: Mapped[Direction] = mapped_column(nullable=False)

    amount_pesewas: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fee_pesewas: Mapped[int] = mapped_column(BigInteger, default=0)
    levy_pesewas: Mapped[int] = mapped_column(BigInteger, default=0)
    balance_after_pesewas: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    counterparty_raw: Mapped[str | None] = mapped_column(nullable=True)
    counterparty_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("counterparty.id"), nullable=True
    )
    provider_reference: Mapped[str | None] = mapped_column(nullable=True)

    category_l1: Mapped[str | None] = mapped_column(nullable=True)
    category_l2: Mapped[str | None] = mapped_column(nullable=True)
    category_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    category_source: Mapped[CategorySource | None] = mapped_column(nullable=True)

    flags: Mapped[dict] = mapped_column(JSONB, default=dict)
    provenance: Mapped[dict] = mapped_column(JSONB, nullable=False)


class Counterparty(IdMixin, Base):
    __tablename__ = "counterparty"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    canonical_name: Mapped[str] = mapped_column(nullable=False)
    msisdn_hash: Mapped[str | None] = mapped_column(nullable=True)
    display_suffix: Mapped[str | None] = mapped_column(String(4), nullable=True)
    kind: Mapped[CounterpartyKind] = mapped_column(default=CounterpartyKind.UNKNOWN)
    first_seen: Mapped[date | None] = mapped_column(nullable=True)
    last_seen: Mapped[date | None] = mapped_column(nullable=True)
    txn_count: Mapped[int] = mapped_column(default=0)
    total_in_pesewas: Mapped[int] = mapped_column(BigInteger, default=0)
    total_out_pesewas: Mapped[int] = mapped_column(BigInteger, default=0)
    # embedding vector(1024) — added once pgvector is provisioned (specs/04-categorise.md); omitted for now
