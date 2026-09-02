import uuid
from datetime import date

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import AccountKind, EntityType, Provider


class Business(IdMixin, Base):
    __tablename__ = "business"

    legal_name: Mapped[str] = mapped_column(nullable=False)
    trading_name: Mapped[str | None] = mapped_column(nullable=True)
    entity_type: Mapped[EntityType] = mapped_column(nullable=False)
    registration_number: Mapped[str | None] = mapped_column(nullable=True)
    tin: Mapped[str | None] = mapped_column(nullable=True)
    sector_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    established_on: Mapped[date | None] = mapped_column(nullable=True)
    region: Mapped[str | None] = mapped_column(nullable=True)
    premises_status: Mapped[str | None] = mapped_column(nullable=True)  # 'rented'|'owned'|'none' — DECLARED
    employee_count_declared: Mapped[int | None] = mapped_column(nullable=True)  # DECLARED

    accounts: Mapped[list["Account"]] = relationship(back_populates="business")


class Account(IdMixin, Base):
    __tablename__ = "account"
    __table_args__ = (UniqueConstraint("business_id", "identifier_hash", name="uq_account_business_identifier"),)

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    kind: Mapped[AccountKind] = mapped_column(nullable=False)
    provider: Mapped[Provider] = mapped_column(nullable=False)
    identifier_hash: Mapped[str] = mapped_column(nullable=False)
    display_suffix: Mapped[str] = mapped_column(String(4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="GHS")
    is_business_use: Mapped[bool | None] = mapped_column(nullable=True)
    ownership_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)

    business: Mapped["Business"] = relationship(back_populates="accounts")
