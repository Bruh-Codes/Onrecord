import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import Band, GapKind, GapSeverity, GapStatus


class Indicator(IdMixin, Base):
    __tablename__ = "indicator"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "code", "period_start", "period_end", "formula_version",
            name="uq_indicator_business_code_period_version",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    code: Mapped[str] = mapped_column(nullable=False)
    period_start: Mapped[date] = mapped_column(nullable=False)
    period_end: Mapped[date] = mapped_column(nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    unit: Mapped[str] = mapped_column(nullable=False)  # pesewas|ratio|days|count|index|months
    formula_version: Mapped[str] = mapped_column(nullable=False)
    inputs: Mapped[dict] = mapped_column(JSONB, default=dict)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ReadinessScore(IdMixin, Base):
    __tablename__ = "readiness_score"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rubric_version: Mapped[str] = mapped_column(nullable=False)
    total: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    band: Mapped[Band] = mapped_column(nullable=False)
    pillars: Mapped[dict] = mapped_column(JSONB, nullable=False)
    contributions: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)


class Gap(IdMixin, Base):
    __tablename__ = "gap"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    kind: Mapped[GapKind] = mapped_column(nullable=False)
    severity: Mapped[GapSeverity] = mapped_column(nullable=False)
    code: Mapped[str] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(nullable=False)
    detail: Mapped[str | None] = mapped_column(nullable=True)
    target_ref: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[GapStatus] = mapped_column(default=GapStatus.OPEN)
    resolution: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Declaration(IdMixin, Base):
    """The only place owner-stated facts live. Nothing here feeds a formula (INV-2)."""

    __tablename__ = "declaration"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    gap_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("gap.id"), nullable=True)
    question: Mapped[str] = mapped_column(nullable=False)
    answer_text: Mapped[str] = mapped_column(nullable=False)
    parsed_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    asked_by: Mapped[str] = mapped_column(nullable=False)  # 'agent' | 'reviewer'
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verification_status: Mapped[str] = mapped_column(default="unverified")  # unverified|corroborated|contradicted


class ChecklistItem(IdMixin, Base):
    __tablename__ = "checklist_item"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    rule_pack_id: Mapped[str] = mapped_column(nullable=False)
    doc_type: Mapped[str] = mapped_column(nullable=False)
    requirement: Mapped[str] = mapped_column(nullable=False)  # required|conditional|optional
    condition_expr: Mapped[str | None] = mapped_column(nullable=True)
    constraint_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    satisfied_by_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(default="missing")  # satisfied|missing|not_applicable
