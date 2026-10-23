import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

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
    description: str | None
    category_l1: str | None
    category_l2: str | None
    category_source: CategorySource | None
    category_confidence: float | None = None
    farm_activity: str | None = None
    season: str | None = None
    flags: dict


class TransactionReviewItem(TransactionSummary):
    """A transaction with the provenance needed to make a classification decision."""

    account_id: uuid.UUID
    document_id: uuid.UUID
    document_filename: str
    document_type: str | None
    provider_reference: str | None
    provenance: dict
    ai_suggestion: dict | None = None


class TransactionPatch(BaseModel):
    category_l1: str | None = None
    category_l2: str | None = None
    flags: dict | None = None
    # Crop/animal and season tags; an empty string clears the tag.
    farm_activity: str | None = Field(None, max_length=80)
    season: str | None = Field(None, max_length=80)


class TransactionDetail(TransactionSummary):
    account_id: uuid.UUID
    document_id: uuid.UUID
    provider_reference: str | None
    category_confidence: float | None
    provenance: dict
