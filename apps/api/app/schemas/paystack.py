import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PaystackConnect(BaseModel):
    # Never echoed back, logged or stored in plain text.
    secret_key: str = Field(min_length=10, max_length=200, repr=False)


class PaystackConnectionOut(BaseModel):
    id: uuid.UUID
    status: Literal["active", "needs_attention", "disconnected"]
    mode: Literal["test", "live"]
    key_last4: str
    last_checked_at: datetime | None
    last_synced_at: datetime | None
    last_error: str | None
    last_result: dict
    payments: int
    records: int
    created_at: datetime
