"""Explicit resource grants; the selected business in a session is not a grant."""
import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import Role


class BusinessAccess(IdMixin, Base):
    __tablename__ = "business_access"
    __table_args__ = (UniqueConstraint("business_id", "user_id", name="uq_business_access_user"),)

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    role: Mapped[Role] = mapped_column(nullable=False)


class BusinessTask(IdMixin, Base):
    __tablename__ = "business_task"

    task_key: Mapped[str] = mapped_column(String(64), unique=True)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"))
