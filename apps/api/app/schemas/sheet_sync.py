import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

SheetField = Literal[
    "date", "money_in", "money_out", "amount", "direction", "description",
    "category", "counterparty", "payment_method", "reference", "product",
]


class SheetMapping(BaseModel):
    header_row: int = Field(ge=0, le=50)
    columns: dict[SheetField, int | None]
    default_direction: Literal["in", "out"] | None = None
    date_order: Literal["dmy", "mdy"] = "dmy"
    # Used for rows whose date cell is empty, for sheets that keep no dates.
    default_date: date | None = None


class SheetConnectionCreate(BaseModel):
    spreadsheet_id: str = Field(min_length=10, max_length=200, pattern=r"^[A-Za-z0-9_-]+$")
    spreadsheet_name: str = Field(min_length=1, max_length=300)
    sheet_gid: int = Field(ge=0)
    sheet_title: str = Field(min_length=1, max_length=300)


class SheetPreviewRequest(BaseModel):
    mapping: SheetMapping | None = None


class SheetTabChange(BaseModel):
    sheet_gid: int = Field(ge=0)


class SheetTab(BaseModel):
    sheet_gid: int
    title: str
    row_count: int | None = None


class SheetMappingUpdate(BaseModel):
    mapping: SheetMapping


class SheetReviewAction(BaseModel):
    action: Literal["skip", "add", "accept", "keep", "remove"]


class SheetRowOut(BaseModel):
    id: uuid.UUID
    row_number: int
    values: list
    parsed: dict | None
    status: str
    review_reason: str | None
    actions: list[str]
    transaction_id: uuid.UUID | None
    first_seen_at: datetime
    history: list


class SheetConnectionOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    spreadsheet_id: str
    spreadsheet_name: str
    sheet_gid: int
    sheet_title: str
    status: str
    mapping: SheetMapping | None
    mapping_confirmed_at: datetime | None
    document_id: uuid.UUID | None
    last_checked_at: datetime | None
    last_synced_at: datetime | None
    last_error: str | None
    last_result: dict
    counts: dict[str, int] = {}
    created_at: datetime


class SheetConnectionDetail(SheetConnectionOut):
    review_rows: list[SheetRowOut] = []
    changed_rows: list[SheetRowOut] = []


class PreviewRow(BaseModel):
    row_number: int
    values: list[str]
    record: dict | None
    issues: list[str]


class FieldProblem(BaseModel):
    field: str
    message: str


class SheetPreview(BaseModel):
    mapping: SheetMapping
    header: list[str]
    columns: list[str]
    rows: list[PreviewRow]
    problems: list[str]
    data_rows: int
    # The same problems, each tied to the question it belongs to.
    field_problems: list[FieldProblem] = []
    # What the data itself says, such as a date column with nothing in it.
    notes: list[FieldProblem] = []
    readable_rows: int = 0
    money_in_pesewas: int = 0
    money_out_pesewas: int = 0
    first_date: date | None = None
    last_date: date | None = None
