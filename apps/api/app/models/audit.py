import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin


class AuditEvent(IdMixin, Base):
    """Every mutating API call writes one (specs/09-api.md §1)."""

    __tablename__ = "audit_event"

    business_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=True)
    actor: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    action: Mapped[str] = mapped_column(nullable=False)
    target: Mapped[str] = mapped_column(nullable=False)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CostEvent(IdMixin, Base):
    """Per-business OCR/LLM spend — a first-class metric (product-spec §10.5, §16)."""

    __tablename__ = "cost_event"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    kind: Mapped[str] = mapped_column(nullable=False)  # 'ocr' | 'llm'
    provider: Mapped[str] = mapped_column(nullable=False)
    model: Mapped[str | None] = mapped_column(nullable=True)
    units: Mapped[int] = mapped_column(nullable=False)
    cost_pesewas: Mapped[int] = mapped_column(BigInteger, nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
