import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AgentAsk(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: uuid.UUID | None = None


class AgentReply(BaseModel):
    session_id: uuid.UUID
    answer: str
    cited_facts: list[str]
    proposed_action: dict | None = None


class AgentSessionSummary(BaseModel):
    id: uuid.UUID
    opened_at: datetime
    preview: str
    message_count: int


class AgentSessionList(BaseModel):
    items: list[AgentSessionSummary]


class AgentSessionMessage(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AgentSessionDetail(BaseModel):
    id: uuid.UUID
    opened_at: datetime
    messages: list[AgentSessionMessage]
