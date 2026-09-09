import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

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


class DocumentDetail(DocumentSummary):
    quality_flags: dict
    page_count: int | None
