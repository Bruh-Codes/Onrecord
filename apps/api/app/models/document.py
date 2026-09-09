import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import DocStatus, DocType, Provider


class Document(IdMixin, Base):
    __tablename__ = "document"
    __table_args__ = (
        Index(
            "uq_document_business_sha256_active",
            "business_id",
            "sha256",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    storage_key: Mapped[str] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    mime: Mapped[str] = mapped_column(nullable=False)
    page_count: Mapped[int | None] = mapped_column(nullable=True)
    doc_type: Mapped[DocType | None] = mapped_column(nullable=True)
    doc_type_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    issuer: Mapped[Provider | None] = mapped_column(nullable=True)
    period_start: Mapped[date | None] = mapped_column(nullable=True)
    period_end: Mapped[date | None] = mapped_column(nullable=True)
    status: Mapped[DocStatus] = mapped_column(default=DocStatus.RECEIVED)
    quality_flags: Mapped[dict] = mapped_column(JSONB, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # soft delete

    extractions: Mapped[list["Extraction"]] = relationship(back_populates="document")

    @property
    def filename(self) -> str:
        """The original filename is the final component of the object key."""
        return self.storage_key.rsplit("/", maxsplit=1)[-1]


class Extraction(IdMixin, Base):
    """Append-only: never UPDATE value_json. To correct a field, insert a new row
    and set superseded_by on the old one (Agent.md INV-4, INV-7)."""

    __tablename__ = "extraction"

    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"), nullable=False)
    page: Mapped[int] = mapped_column(nullable=False)
    field_path: Mapped[str] = mapped_column(nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extractor: Mapped[str] = mapped_column(nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    superseded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    document: Mapped["Document"] = relationship(back_populates="extractions")
