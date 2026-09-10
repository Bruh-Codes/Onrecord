import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Band, GapKind, GapSeverity, GapStatus


class CoverageRange(BaseModel):
    from_: date | None = Field(alias="from")
    to: date | None

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


class InvoiceInsightItem(BaseModel):
    document_id: uuid.UUID
    filename: str
    kind: str
    supplier: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    currency: str | None = None
    subtotal_pesewas: int | None = None
    tax_pesewas: int | None = None
    total_pesewas: int | None = None
    payment_status: str | None = None
    line_item_count: int = 0
    validation_issues: list[str] = Field(default_factory=list)


class InvoiceInsights(BaseModel):
    total_documents: int
    issued_count: int
    received_count: int
    totals_by_currency: dict[str, dict[str, int]]
    items: list[InvoiceInsightItem]


class IndicatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    computed_at: datetime
    rubric_version: str
    total: float
    band: Band
    pillars: dict
    contributions: list[dict]


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rule_pack_id: str
    doc_type: str
    requirement: str
    condition_expr: str | None
    constraint_json: dict | None
    satisfied_by_document_id: uuid.UUID | None
    status: str


class GapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
