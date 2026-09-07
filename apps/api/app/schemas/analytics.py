import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Band, GapKind, GapSeverity, GapStatus


class CoverageRange(BaseModel):
    from_: date = Field(alias="from")
    to: date

    model_config = ConfigDict(populate_by_name=True)


class AccountCoverage(BaseModel):
    account_id: uuid.UUID
    covered: list[CoverageRange]
    holes: list[CoverageRange]


class Coverage(BaseModel):
    accounts: list[AccountCoverage]
    analysis_window: CoverageRange
    analysis_window_months: int
    continuous_months: int


class IndicatorOut(BaseModel):
    id: uuid.UUID
    code: str
    period_start: date
    period_end: date
    value_json: dict
    unit: str
    formula_version: str
    inputs: dict
    computed_at: datetime


class ReadinessScoreOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    computed_at: datetime
    rubric_version: str
    total: float
    band: Band
    pillars: dict
    contributions: dict


class ChecklistItemOut(BaseModel):
    id: uuid.UUID
    rule_pack_id: str
    doc_type: str
    requirement: str
    condition_expr: str | None
    constraint_json: dict | None
    satisfied_by_document_id: uuid.UUID | None
    status: str


class GapOut(BaseModel):
    id: uuid.UUID
    kind: GapKind
    severity: GapSeverity
    code: str
    title: str
    detail: str | None
    target_ref: dict
    status: GapStatus
    resolution: dict | None
    resolved_at: datetime | None
    created_at: datetime


class GapWaive(BaseModel):
    reason: str


class TaskOut(BaseModel):
    task_id: str
    state: str
    progress: int
    result: dict | None