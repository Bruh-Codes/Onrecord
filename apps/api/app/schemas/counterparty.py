import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.enums import CounterpartyKind


class CounterpartyDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    canonical_name: str
    display_suffix: str | None
    kind: CounterpartyKind
    first_seen: date | None
    last_seen: date | None
    txn_count: int
    total_in_pesewas: int
    total_out_pesewas: int