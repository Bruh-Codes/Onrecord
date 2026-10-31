import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin


class SheetConnection(IdMixin, Base):
    """A spreadsheet tab the owner asked OnRecord to keep reading.

    Status is one of needs_mapping, active, paused, needs_attention or
    disconnected. Rows land on this connection's own informal-ledger document
    and cash-book account, so they count as declared records (Agent.md INV-2).
    """

    __tablename__ = "sheet_connection"
    __table_args__ = (
        Index(
            "uq_sheet_connection_live_tab",
            "business_id",
            "spreadsheet_id",
            "sheet_gid",
            unique=True,
            postgresql_where=text("status <> 'disconnected'"),
        ),
        Index("ix_sheet_connection_status_checked", "status", "last_checked_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    # Whose Google account reads the file. Their Better Auth tokens are used.
    connected_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="google_sheets")
    spreadsheet_id: Mapped[str] = mapped_column(String(200), nullable=False)
    spreadsheet_name: Mapped[str] = mapped_column(nullable=False)
    sheet_gid: Mapped[int] = mapped_column(Integer, nullable=False)
    sheet_title: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="needs_mapping")
    mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mapping_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.id"), nullable=True)
    remote_modified_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(nullable=True)
    last_result: Mapped[dict] = mapped_column(JSONB, default=dict)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SheetRow(IdMixin, Base):
    """One row OnRecord has seen in a connected sheet.

    Rows have no stable id in a spreadsheet, so a row is known by a fingerprint
    of its contents plus an occurrence number for identical rows. `values` and
    `parsed` always hold what the sheet says now; the transaction may lag behind
    while an edit waits for the owner (status needs_review). `history` keeps
    every earlier version, so a lender can see what changed and when.

    Status: recorded, needs_review, removed or skipped.
    """

    __tablename__ = "sheet_row"
    __table_args__ = (
        UniqueConstraint("connection_id", "fingerprint", "occurrence", name="uq_sheet_row_fingerprint"),
        Index("ix_sheet_row_connection_status", "connection_id", "status"),
    )

    connection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sheet_connection.id"), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    occurrence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    values: Mapped[list] = mapped_column(JSONB, nullable=False)
    parsed: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    review_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    initial_import: Mapped[bool] = mapped_column(default=False)
    history: Mapped[list] = mapped_column(JSONB, default=list)
