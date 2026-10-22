import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.services.transaction_mapping import CATEGORIES

CategoryL1 = Literal[CATEGORIES]  # type: ignore[valid-type]


class ExtractedRow(BaseModel):
    id: uuid.UUID
    occurred_on: date
    description: str
    counterparty: str | None
    reference: str | None
    direction: Literal["in", "out"]
    amount_pesewas: int
    fee_pesewas: int
    levy_pesewas: int
    balance_after_pesewas: int | None
    category_l1: str
    page: int
    source_ref: str
    excluded: bool = False
    corrected: bool = False


class ExtractedRows(BaseModel):
    document_id: uuid.UUID
    state: str
    summary: str
    findings: list[str]
    reconciliation: dict | None
    confidence: float | None
    model: str | None
    rows: list[ExtractedRow]


class RowDecision(BaseModel):
    """The owner's decision on one staged row. Omitted fields keep the read value."""

    id: uuid.UUID
    include: bool = True
    occurred_on: date | None = None
    description: str | None = Field(default=None, max_length=500)
    counterparty: str | None = Field(default=None, max_length=200)
    direction: Literal["in", "out"] | None = None
    amount_pesewas: int | None = Field(default=None, gt=0)
    fee_pesewas: int | None = Field(default=None, ge=0)
    levy_pesewas: int | None = Field(default=None, ge=0)
    balance_after_pesewas: int | None = None
    category_l1: CategoryL1 | None = None


class ConfirmRows(BaseModel):
    rows: list[RowDecision] = Field(default_factory=list)


class ConfirmResult(BaseModel):
    document_id: uuid.UUID
    state: str
    transactions_created: int
    duplicates_skipped: int
