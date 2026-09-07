import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AccountKind, Provider


class AccountCreate(BaseModel):
    kind: AccountKind
    provider: Provider
    identifier_hash: str
    display_suffix: str = Field(min_length=3, max_length=4)
    currency: str = "GHS"
    is_business_use: bool | None = None
    ownership_confidence: float | None = Field(default=None, ge=0, le=1)


class AccountDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    kind: AccountKind
    provider: Provider
    display_suffix: str
    currency: str
    is_business_use: bool | None
    ownership_confidence: float | None
    created_at: str