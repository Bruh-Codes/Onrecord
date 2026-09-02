import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.enums import EntityType
from app.schemas.common import Declared


class BusinessCreate(BaseModel):
    legal_name: str
    trading_name: str | None = None
    entity_type: EntityType
    registration_number: str | None = None
    tin: str | None = None
    sector_code: str | None = None
    region: str | None = None
    premises_status: str | None = None


class BusinessPatch(BaseModel):
    legal_name: str | None = None
    trading_name: str | None = None
    registration_number: str | None = None
    tin: str | None = None
    sector_code: str | None = None
    region: str | None = None
    premises_status: str | None = None
    employee_count_declared: int | None = None


class BusinessDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    legal_name: str
    trading_name: str | None
    entity_type: EntityType
    registration_number: str | None
    tin: str | None
    sector_code: str | None
    established_on: date | None
    region: str | None
    premises_status: Declared[str] | None = None
    employee_count_declared: Declared[int] | None = None

    @classmethod
    def from_model(cls, business) -> "BusinessDetail":
        data = {
            "id": business.id,
            "legal_name": business.legal_name,
            "trading_name": business.trading_name,
            "entity_type": business.entity_type,
            "registration_number": business.registration_number,
            "tin": business.tin,
            "sector_code": business.sector_code,
            "established_on": business.established_on,
            "region": business.region,
            "premises_status": Declared(value=business.premises_status) if business.premises_status else None,
            "employee_count_declared": (
                Declared(value=business.employee_count_declared)
                if business.employee_count_declared is not None
                else None
            ),
        }
        return cls(**data)
