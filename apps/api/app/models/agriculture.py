"""Farm declarations/allocations never enter the document-derived indicators."""
import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin


class FarmType(StrEnum):
    CROP = "crop"
    LIVESTOCK = "livestock"
    AQUACULTURE = "aquaculture"


class FarmKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class CycleStage(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"


class Enterprise(IdMixin, Base):
    __tablename__ = "farm_enterprise"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_enterprise_business"),
        UniqueConstraint("business_id", "external_key", name="uq_enterprise_seed"),
    )
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[FarmType]
    subtype: Mapped[str] = mapped_column(String(60))
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    external_key: Mapped[str | None] = mapped_column(String(160), nullable=True)


class ProductionCycle(IdMixin, Base):
    __tablename__ = "farm_cycle"
    __table_args__ = (
        ForeignKeyConstraint(["enterprise_id", "business_id"], ["farm_enterprise.id", "farm_enterprise.business_id"]),
        UniqueConstraint("id", "enterprise_id", "business_id", name="uq_cycle_enterprise_business"),
        UniqueConstraint("business_id", "external_key", name="uq_cycle_seed"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_cycle_dates"),
    )
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), index=True)
    enterprise_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[date]
    end_date: Mapped[date | None] = mapped_column(nullable=True)
    expected_harvest_date: Mapped[date | None] = mapped_column(nullable=True)
    stage: Mapped[CycleStage] = mapped_column(default=CycleStage.ACTIVE)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    external_key: Mapped[str | None] = mapped_column(String(160), nullable=True)


class FarmEntry(IdMixin, Base):
    __tablename__ = "farm_entry"
    __table_args__ = (
        ForeignKeyConstraint(["enterprise_id", "business_id"], ["farm_enterprise.id", "farm_enterprise.business_id"]),
        ForeignKeyConstraint(["cycle_id", "enterprise_id", "business_id"], ["farm_cycle.id", "farm_cycle.enterprise_id", "farm_cycle.business_id"]),
        CheckConstraint("cycle_id IS NULL OR enterprise_id IS NOT NULL", name="ck_entry_cycle_enterprise"),
        CheckConstraint("(enterprise_id IS NULL AND shared_overhead) OR (enterprise_id IS NOT NULL AND NOT shared_overhead)", name="ck_entry_scope"),
        CheckConstraint("NOT shared_overhead OR kind = 'EXPENSE'", name="ck_overhead_expense"),
        CheckConstraint("(source_transaction_id IS NULL AND amount_pesewas IS NOT NULL AND amount_pesewas > 0) OR (source_transaction_id IS NOT NULL AND amount_pesewas IS NULL)", name="ck_entry_source_amount"),
        UniqueConstraint("business_id", "external_key", name="uq_entry_seed"),
        Index("ix_farm_entry_business_date", "business_id", "occurred_on"),
        Index("uq_farm_entry_active_source", "source_transaction_id", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"))
    enterprise_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    shared_overhead: Mapped[bool] = mapped_column(Boolean, default=False)
    kind: Mapped[FarmKind]
    occurred_on: Mapped[date]
    amount_pesewas: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(400))
    source_transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("transaction.id"), nullable=True)
    evidence_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
