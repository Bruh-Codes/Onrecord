import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import EntityType
from app.schemas.common import Declared

# A GRA TIN or Ghana Card PIN (GHA-123456789-0), which is the TIN for individuals.
Tin = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, max_length=20)]
# Coarse ISIC rev4 division, e.g. "47" retail trade or "01" crop and animal farming.
SectorCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=2)]
TaxStatus = Literal["farm_produce", "flat_tax", "vat_registered", "not_sure"]


class BusinessCreate(BaseModel):
    legal_name: str
    trading_name: str | None = None
    entity_type: EntityType
    registration_number: str | None = None
    tin: Tin | None = None
    tax_status: TaxStatus | None = None
    sector_code: SectorCode | None = None
    region: str | None = None
    premises_status: str | None = None


class BusinessPatch(BaseModel):
    legal_name: str | None = None
    trading_name: str | None = None
    registration_number: str | None = None
    tin: Tin | None = None
    tax_status: TaxStatus | None = None
    sector_code: SectorCode | None = None
    region: str | None = None
    premises_status: str | None = None
    employee_count_declared: int | None = None


class BusinessDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_demo: bool = False
    legal_name: str
    trading_name: str | None
    entity_type: EntityType
    registration_number: str | None
    tin: str | None
    tax_status: Declared[str] | None = None
    sector_code: str | None
    established_on: date | None
    region: str | None
    premises_status: Declared[str] | None = None
    employee_count_declared: Declared[int] | None = None

    @classmethod
    def from_model(cls, business) -> "BusinessDetail":
        data = {
            "id": business.id,
            "is_demo": business.is_demo,
            "legal_name": business.legal_name,
            "trading_name": business.trading_name,
            "entity_type": business.entity_type,
            "registration_number": business.registration_number,
            "tin": business.tin,
            "tax_status": Declared(value=business.tax_status) if business.tax_status else None,
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
