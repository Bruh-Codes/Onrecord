import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocStatus, DocType, Provider


class DocumentCreate(BaseModel):
    filename: str
    mime: str
    size_bytes: int
    sha256: str
    replace_document_id: uuid.UUID | None = None


class DocumentUploadTarget(BaseModel):
    document_id: uuid.UUID
    upload_url: str
    upload_expires_at: datetime


class DocumentConfirm(BaseModel):
    doc_type: DocType


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    doc_type: DocType | None
    doc_type_confidence: float | None
    issuer: Provider | None
    period_start: date | None
    period_end: date | None
    status: DocStatus
    quality_flags: dict
    created_at: datetime


class FinancialStatementValue(BaseModel):
    extraction_id: uuid.UUID
    line_index: int
    source_id: str
    label: str
    section: str | None
    parent_line_index: int | None
    depth: int
    is_total: bool
    period: str
    value_pesewas: int
    raw_value: str
    kind: Literal["extracted"]
    canonical_concept: str | None
    mapping_confidence: float | None
    mapping_method: str | None
    structure_confidence: float | None
    structure_method: str | None
    page: int
    bbox: dict[str, Any] | None
    confidence: float | None


class FinancialStatement(BaseModel):
    statement_index: int
    statement_type: str
    periods: list[str]
    currency: str = "GHS"
    scale: int = 1
    validation_issues: list[str]
    values: list[FinancialStatementValue]


class InvoiceLineItem(BaseModel):
    extraction_id: uuid.UUID
    description: str
    quantity: str | None = None
    unit_price_pesewas: int | None = None
    line_total_pesewas: int | None = None
    raw: dict[str, str]
    page: int | None = None


class Invoice(BaseModel):
    fields: dict[str, Any]
    extra_fields: dict[str, str] = Field(default_factory=dict)
    validation_issues: list[str] = Field(default_factory=list)
    line_items: list[InvoiceLineItem] = Field(default_factory=list)


class DocumentDetail(DocumentSummary):
    quality_flags: dict
    page_count: int | None
    financial_statements: list[FinancialStatement] = Field(default_factory=list)
    invoice: Invoice | None = None


class EvidenceReviewFinding(BaseModel):
    code: str
    severity: str
    reason: str
    evidence_ref: str


class EvidenceReviewOut(BaseModel):
    document_id: uuid.UUID
    business_id: uuid.UUID
    status: str
    risk_level: str
    scoring_eligible: bool
    summary: str
    findings: list[EvidenceReviewFinding]
    model: str | None
    input_hash: str
    reviewed_by: uuid.UUID | None = None
    reviewed_at: datetime | None = None


class EvidenceReviewDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(min_length=1, max_length=1000)
