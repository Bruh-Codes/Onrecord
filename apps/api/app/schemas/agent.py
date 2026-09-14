import uuid

from pydantic import BaseModel, Field


class AgentAsk(BaseModel):
    message: str = Field(min_length=1, max_length=600)
    session_id: uuid.UUID | None = None


class AgentReply(BaseModel):
    session_id: uuid.UUID
    answer: str
    cited_facts: list[str]
    proposed_action: dict | None = None
