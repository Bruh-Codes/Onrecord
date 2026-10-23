import uuid
from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.agriculture import CycleStage, FarmKind, FarmType


class FarmInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EnterpriseMetadata(FarmInput):
    area: float | None = Field(None, gt=0, le=1_000_000)
    area_unit: Literal["acres", "hectares"] | None = None

    @model_validator(mode="after")
    def area_has_unit(self):
        if (self.area is None) != (self.area_unit is None):
            raise ValueError("Provide both farm area and its unit.")
        return self


class CycleMetadata(FarmInput):
    batch_size: int | None = Field(None, gt=0, le=10_000_000, strict=True)
    pond_count: int | None = Field(None, gt=0, le=100_000, strict=True)


class EnterpriseCreate(FarmInput):
    name: str = Field(min_length=1, max_length=120)
    type: FarmType
    subtype: str = Field(min_length=1, max_length=60)
    region: str | None = Field(None, max_length=100)
    metadata_json: EnterpriseMetadata = Field(default_factory=EnterpriseMetadata)


class EnterpriseOut(EnterpriseCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    business_id: uuid.UUID


class CycleCreate(FarmInput):
    enterprise_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    start_date: date
    end_date: date | None = None
    expected_harvest_date: date | None = None
    stage: CycleStage = CycleStage.ACTIVE
    metadata_json: CycleMetadata = Field(default_factory=CycleMetadata)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Cycle end must be on or after its start.")
        if self.expected_harvest_date and self.expected_harvest_date < self.start_date:
            raise ValueError("Expected harvest must be on or after cycle start.")
        return self


class CycleOut(CycleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    business_id: uuid.UUID


class EntryWrite(FarmInput):
    enterprise_id: uuid.UUID | None = None
    cycle_id: uuid.UUID | None = None
    shared_overhead: bool = False
    kind: FarmKind
    occurred_on: date
    amount_pesewas: int | None = Field(None, gt=0, le=1_000_000_000_000, strict=True)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=400)
    source_transaction_id: uuid.UUID | None = None
    evidence_document_id: uuid.UUID | None = None
    currency: Literal["GHS"] = "GHS"

    @model_validator(mode="after")
    def valid_scope_and_source(self):
        if self.shared_overhead == (self.enterprise_id is not None):
            raise ValueError("Select an enterprise or explicitly choose shared overhead.")
        if self.cycle_id and not self.enterprise_id:
            raise ValueError("A production cycle requires an enterprise.")
        if self.shared_overhead and self.kind != FarmKind.EXPENSE:
            raise ValueError("Shared overhead must be an expense.")
        if (self.source_transaction_id is None) == (self.amount_pesewas is None):
            raise ValueError("Provide a manual amount or link a source transaction, never both.")
        if self.occurred_on > datetime.now(UTC).date():
            raise ValueError("Record actual activity on or before today; forecasts are separate.")
        return self


class EntryOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    enterprise_id: uuid.UUID | None
    enterprise_name: str | None
    cycle_id: uuid.UUID | None
    shared_overhead: bool
    kind: FarmKind
    occurred_on: date
    amount_pesewas: int
    fee_pesewas: int = 0
    levy_pesewas: int = 0
    currency: Literal["GHS"] = "GHS"
    category: str
    description: str
    value_kind: Literal["declared", "extracted"]
    source_transaction_id: uuid.UUID | None
    evidence_document_id: uuid.UUID | None
    evidence_status: Literal["none", "attached"]
    updated_at: datetime


class FinanceTotals(BaseModel):
    receipts_pesewas: int = 0
    expenditures_pesewas: int = 0
    surplus_pesewas: int = 0
    count: int = 0
    without_evidence: int = 0


class FinanceGroup(FinanceTotals):
    key: str
    label: str


class FarmSummary(BaseModel):
    business_id: uuid.UUID
    business_name: str
    region: str | None
    is_demo: bool
    generated_at: datetime
    period_from: date | None
    period_to: date | None
    enterprise_id: uuid.UUID | None
    cycle_id: uuid.UUID | None
    totals: FinanceTotals
    sources: dict[str, FinanceTotals]
    enterprises: list[FinanceGroup]
    months: list[FinanceGroup]
    warnings: list[str]
    insights: list[str]
    method: str
    formula_version: str = "farm-records-1.0"
    independent_verification: Literal[False] = False
    record_version: str


class FarmReport(FarmSummary):
    entries: list[EntryOut]
