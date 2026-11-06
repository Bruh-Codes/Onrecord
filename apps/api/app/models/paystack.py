import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin


class PaystackConnection(IdMixin, Base):
    """A Paystack account whose payments OnRecord keeps reading.

    Paystack has no sign-in-with-Paystack for other apps and no read-only
    keys, so the owner gives OnRecord their secret key. It is stored only
    encrypted (`key_ciphertext`), never returned by the API, and wiped on
    disconnect. OnRecord only ever lists records with it (GET requests).

    Status: active, needs_attention or disconnected. Payments land on this
    connection's own POS account and processor-statement document.
    """

    __tablename__ = "paystack_connection"
    __table_args__ = (
        Index(
            "uq_paystack_connection_live",
            "business_id",
            unique=True,
            postgresql_where=text("status <> 'disconnected'"),
        ),
        Index("ix_paystack_connection_status_checked", "status", "last_checked_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    connected_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    key_ciphertext: Mapped[str | None] = mapped_column(nullable=True)
    key_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    # "test" for sk_test_ keys, "live" for sk_live_ keys.
    mode: Mapped[str] = mapped_column(String(8), nullable=False)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.id"), nullable=True)
    # Everything up to this moment has been read. The next sync re-reads a
    # little before it, because Paystack can finish a payment late.
    synced_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(nullable=True)
    last_result: Mapped[dict] = mapped_column(JSONB, default=dict)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
