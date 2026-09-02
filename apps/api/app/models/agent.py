import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import IdMixin


class AgentSession(IdMixin, Base):
    __tablename__ = "agent_session"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business.id"), nullable=False)
    opened_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score_before: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    score_after: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    questions_asked: Mapped[int] = mapped_column(default=0)


class AgentMessage(IdMixin, Base):
    __tablename__ = "agent_message"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_session.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(nullable=False)  # 'agent' | 'owner' | 'tool'
    content: Mapped[str] = mapped_column(nullable=False)
    tool_name: Mapped[str | None] = mapped_column(nullable=True)
    tool_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
