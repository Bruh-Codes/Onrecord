import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import CategorySource, Direction


class TransactionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_on: date
    direction: Direction
    amount_pesewas: int
    fee_pesewas: int
    levy_pesewas: int
    balance_after_pesewas: int | None
    counterparty_raw: str | None
    category_l1: str | None
    category_l2: str | None
    category_source: CategorySource | None
    flags: dict


class TransactionPatch(BaseModel):
    category_l1: str | None = None
    category_l2: str | None = None
    flags: dict | None = None


class TransactionDetail(TransactionSummary):
    account_id: uuid.UUID
    document_id: uuid.UUID
    provider_reference: str | None
    category_confidence: float | None
    provenance: dict