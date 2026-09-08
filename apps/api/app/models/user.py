import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin
from app.models.enums import Role


class User(IdMixin, Base):
    """Identity itself lives in Better Auth (apps/web); this row is the mirror
    apps/api joins against for business/institution scoping-see Agent.md §4."""

    __tablename__ = "user"

    role: Mapped[Role] = mapped_column(nullable=False)
    phone_hash: Mapped[str | None] = mapped_column(nullable=True)
    email: Mapped[str | None] = mapped_column(nullable=True)
    business_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
