"""Lossless financial-statement extraction from Docling tables.

Every printed line item and period value is retained. Canonical concepts are
optional labels; they never replace the source wording or originate amounts.
"""

import re
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation

from app.services.document_processing import DocumentCell, DocumentTable
from app.services.financial_mapping import FinancialStructureMapper, StructureRow


@dataclass(frozen=True)
class FinancialField:
    statement_index: int
    line_index: int
    source_id: str
    label: str
    period: str
    value_pesewas: int
    raw_value: str
    page: int = 1
    bbox: dict | None = None
    section: str | None = None
    parent_line_index: int | None = None
    depth: int = 0
    is_total: bool = False
    statement_type: str = "other"
    canonical_concept: str | None = None
    mapping_confidence: float | None = None
    mapping_method: str | None = None
    structure_confidence: float | None = None
    structure_method: str | None = None

    @property
    def key(self) -> str:
        return self.canonical_concept or _slug(self.label)


@dataclass(frozen=True)
class FinancialStatementSummary:
    statement_index: int
    statement_type: str
    periods: tuple[str, ...]
    currency: str
    scale: int
    line_item_count: int
    validation_issues: tuple[str, ...]


_FIELD_ALIASES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("revenue", ("revenue", "sales", "turnover", "total income")),
    ("cost_of_sales", ("cost of sales", "cost of goods sold", "cost of goods")),
    ("gross_profit", ("gross profit",)),
    ("operating_expenses", ("operating expenses", "operating costs", "total expenses")),
    ("profit_before_tax", ("profit before tax", "profit before taxation")),
    ("tax_expense", ("income tax expense", "tax expense", "taxation")),
    ("net_profit", ("net profit", "profit after tax", "profit for the year", "net income")),
    ("cash", ("cash and cash equivalents", "cash at bank", "cash")),
    ("inventory", ("inventory", "inventories", "stock")),
    ("receivables", ("trade receivables", "accounts receivable", "debtors")),
    ("payables", ("trade payables", "accounts payable", "creditors")),
    ("total_assets", ("total assets",)),
    ("current_assets", ("current assets", "total current assets")),
    ("non_current_assets", ("non-current assets", "non current assets", "total non-current assets")),
    ("total_liabilities", ("total liabilities",)),
    ("current_liabilities", ("current liabilities", "total current liabilities")),
    ("non_current_liabilities", ("non-current liabilities", "non current liabilities")),
    ("equity", ("total equity", "shareholders' equity", "shareholders equity", "owner's equity", "equity")),
)
_CURRENCY_RE = re.compile(r"(?:GH(?:S|¢|Â¢)|₵)\s*", re.IGNORECASE)
_AMOUNT_RE = re.compile(r"^\s*(?:GH(?:S|¢|Â¢)|₵)?\s*\(?\s*[+-]?\s*\d[\d,]*(?:\.\d{1,2})?\s*\)?\s*$", re.I)
_PERIOD_RE = re.compile(r"\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b", re.I)
_NOTE_RE = re.compile(r"^notes?$", re.I)


def parse_financial_statement(
    text: str,
    tables: tuple[DocumentTable, ...] | list[DocumentTable] = (),
    *,
    structure_mapper: FinancialStructureMapper | None = None,
) -> tuple[list[FinancialField], str | None]:
    """Extract every printed amount from financial tables without inventing values."""
    currency = _detect_currency(text)
    if currency != "GHS":
        return [], f"Unsupported financial-statement currency: {currency}"
    source_tables = tuple(tables) or _tables_from_markdown(text)
    fields: list[FinancialField] = []
    scale = _detect_scale(text)
    for statement_index, table in enumerate(source_tables):
        table_fields = _parse_table(table, statement_index, scale)
        if table_fields:
            fields.extend(_apply_structure(table_fields, structure_mapper))
    return (fields, None) if fields else ([], "No explicit financial-statement line items were found")


def summarize_financial_fields(text: str, fields: list[FinancialField]) -> list[FinancialStatementSummary]:
    summaries: list[FinancialStatementSummary] = []
    for statement_index in sorted({field.statement_index for field in fields}):
        statement_fields = [field for field in fields if field.statement_index == statement_index]
        summaries.append(FinancialStatementSummary(
            statement_index=statement_index,
            statement_type=statement_fields[0].statement_type,
            periods=tuple(dict.fromkeys(field.period for field in statement_fields)),
            currency=_detect_currency(text),
            scale=_detect_scale(text),
            line_item_count=len({field.line_index for field in statement_fields}),
            validation_issues=tuple(_validation_issues(statement_fields)),
        ))
    return summaries


def _parse_table(table: DocumentTable, statement_index: int, scale: int) -> list[FinancialField]:
    grid = _grid(table)
    amount_columns = _amount_columns(grid)
    if not grid or not amount_columns:
        return []
    statement_type = _statement_type(" ".join(cell.text for cell in table.cells))
    periods = {column: _period_for_column(grid, column) for column in amount_columns}
    current_section: str | None = None
    fields: list[FinancialField] = []
    line_index = 0
    for row_number, row in enumerate(grid):
        label_cell = _label_cell(row, amount_columns)
        if label_cell is None:
            continue
        label = label_cell.text.strip()
        values = [(column, _to_pesewas(_cell_text(row, column), scale)) for column in amount_columns]
        values = [(column, value) for column, value in values if value is not None]
        if not values:
            if not _is_header_label(label):
                current_section = label
            continue
        if row_number < 3 and _is_header_label(label):
            continue
        canonical = _canonical_concept(label)
        for column, value in values:
            amount_cell = _cell_at(row, column)
            if amount_cell is None:
                continue
            fields.append(FinancialField(
                statement_index=statement_index,
                line_index=line_index,
                source_id=f"s{statement_index}:l{line_index}",
                label=label,
                period=periods[column],
                value_pesewas=value,
                raw_value=amount_cell.text.strip(),
                page=amount_cell.page,
                bbox=amount_cell.bbox,
                section=current_section,
                depth=max(0, (len(label_cell.text) - len(label_cell.text.lstrip())) // 2),
                is_total=_is_total(label),
                statement_type=statement_type,
                canonical_concept=canonical,
                mapping_confidence=1.0 if canonical else None,
                mapping_method="rules:v1" if canonical else None,
            ))
        line_index += 1
    return fields


def _apply_structure(
    fields: list[FinancialField],
    mapper: FinancialStructureMapper | None,
) -> list[FinancialField]:
    if mapper is None:
        return fields
    source_rows = {
        field.source_id: StructureRow(
            source_id=field.source_id,
            label=field.label,
            sequence=field.line_index,
            detected_section=field.section,
            detected_depth=field.depth,
            detected_is_total=field.is_total,
        )
        for field in fields
    }
    structure = mapper.structure_rows(list(source_rows.values()), fields[0].statement_type)
    if structure is None:
        return fields
    annotations = {annotation.source_id: annotation for annotation in structure.annotations}
    statement_type = (
        structure.statement_type
        if structure.statement_type_confidence >= 0.85
        else fields[0].statement_type
    )
    output: list[FinancialField] = []
    for field in fields:
        annotation = annotations.get(field.source_id)
        if annotation is None:
            output.append(replace(field, statement_type=statement_type))
            continue
        canonical = field.canonical_concept or annotation.canonical_concept
        parent_line_index = (
            source_rows[annotation.parent_source_id].sequence
            if annotation.parent_source_id in source_rows
            else None
        )
        output.append(replace(
            field,
            statement_type=statement_type,
            section=annotation.section or field.section,
            parent_line_index=parent_line_index,
            depth=annotation.depth,
            is_total=field.is_total or annotation.is_total,
            canonical_concept=canonical,
            mapping_confidence=(
                field.mapping_confidence if field.canonical_concept else annotation.confidence
            ),
            mapping_method=field.mapping_method or ("model" if canonical else None),
            structure_confidence=annotation.confidence,
            structure_method="model",
        ))
    return output


def _grid(table: DocumentTable) -> list[list[DocumentCell | None]]:
    grid = [[None for _ in range(table.column_count)] for _ in range(table.row_count)]
    for cell in table.cells:
        if 0 <= cell.row < table.row_count and 0 <= cell.column < table.column_count:
            grid[cell.row][cell.column] = cell
    return grid


def _amount_columns(grid: list[list[DocumentCell | None]]) -> list[int]:
    column_count = max((len(row) for row in grid), default=0)
    columns: list[int] = []
    for column in range(1, column_count):
        texts = [_cell_text(row, column).strip() for row in grid]
        if any(_NOTE_RE.match(text) for text in texts[:3]):
            continue
        numeric_count = sum(_to_pesewas(text) is not None for text in texts)
        if numeric_count >= 1:
            columns.append(column)
    return columns


def _period_for_column(grid: list[list[DocumentCell | None]], column: int) -> str:
    for row in grid[:4]:
        text = _cell_text(row, column).strip()
        if text and (_PERIOD_RE.search(text) or not _AMOUNT_RE.match(text)) and not _NOTE_RE.match(text):
            return text
    return f"period_{column}"


def _label_cell(row: list[DocumentCell | None], amount_columns: list[int]) -> DocumentCell | None:
    for cell in row[:min(amount_columns)]:
        if cell is not None and cell.text.strip() and _to_pesewas(cell.text) is None:
            return cell
    return None


def _cell_at(row: list[DocumentCell | None], column: int) -> DocumentCell | None:
    return row[column] if column < len(row) else None


def _cell_text(row: list[DocumentCell | None], column: int) -> str:
    cell = _cell_at(row, column)
    return cell.text if cell is not None else ""


def _to_pesewas(raw: str, scale: int = 1) -> int | None:
    value = raw.strip()
    if value in {"-", "–", "—"}:
        return 0
    if not _AMOUNT_RE.match(value):
        return None
    normalized = _CURRENCY_RE.sub("", value).replace(",", "").strip()
    negative = normalized.startswith("-") or (normalized.startswith("(") and normalized.endswith(")"))
    normalized = normalized.strip("()").replace(" ", "")
    try:
        amount = Decimal(normalized)
    except InvalidOperation:
        return None
    if amount.as_tuple().exponent < -2:
        return None
    pesewas = int(abs(amount) * scale * 100)
    return -pesewas if negative or amount < 0 else pesewas


def _canonical_concept(label: str) -> str | None:
    normalized = re.sub(r"\s+", " ", label.strip().lower()).rstrip(":")
    return next((concept for concept, aliases in _FIELD_ALIASES if normalized in aliases), None)


def _statement_type(text: str) -> str:
    lowered = text.lower()
    if any(marker in lowered for marker in ("cash flow", "cashflow", "operating activities")):
        return "cash_flow"
    if any(marker in lowered for marker in ("balance sheet", "financial position", "total assets")):
        return "balance_sheet"
    if any(marker in lowered for marker in ("profit or loss", "income statement", "revenue", "turnover")):
        return "income_statement"
    if any(marker in lowered for marker in ("changes in equity", "retained earnings")):
        return "changes_in_equity"
    return "other"


def _detect_scale(text: str) -> int:
    lowered = text.lower()
    if re.search(r"(?:figures|amounts)?\s*(?:are\s+)?in\s+(?:ghs\s+)?millions|(?:ghs|gh¢|₵)\s*'?000,?000", lowered):
        return 1_000_000
    if re.search(r"(?:figures|amounts)?\s*(?:are\s+)?in\s+(?:ghs\s+)?thousands|(?:ghs|gh¢|₵)\s*'?000", lowered):
        return 1_000
    return 1


def _detect_currency(text: str) -> str:
    upper = text.upper()
    for currency, markers in {
        "USD": ("USD", "US$"),
        "EUR": ("EUR", "€"),
        "GBP": ("GBP", "£"),
        "NGN": ("NGN", "₦"),
    }.items():
        if any(marker in upper for marker in markers) and not re.search(r"\bGHS\b|GH¢|₵", text, re.I):
            return currency
    return "GHS"


def _is_total(label: str) -> bool:
    lowered = label.strip().lower()
    return lowered.startswith("total ") or lowered in {"gross profit", "profit before tax", "profit after tax", "net profit", "profit for the year"}


def _is_header_label(label: str) -> bool:
    return bool(_PERIOD_RE.search(label)) or label.lower() in {"description", "particulars", "item", "account"}


def _validation_issues(fields: list[FinancialField]) -> list[str]:
    issues: list[str] = []
    by_period: dict[str, dict[str, int]] = {}
    for field in fields:
        mapping_is_accepted = field.mapping_method != "model" or (field.mapping_confidence or 0) >= 0.85
        if field.canonical_concept and mapping_is_accepted:
            by_period.setdefault(field.period, {})[field.canonical_concept] = field.value_pesewas
    for period, values in by_period.items():
        if {"total_assets", "total_liabilities", "equity"} <= values.keys() and values["total_assets"] != values["total_liabilities"] + values["equity"]:
            issues.append(f"accounting_equation_failed:{period}")
        if {"revenue", "cost_of_sales", "gross_profit"} <= values.keys() and values["revenue"] - abs(values["cost_of_sales"]) != values["gross_profit"]:
            issues.append(f"gross_profit_failed:{period}")
    return issues


def _tables_from_markdown(text: str) -> tuple[DocumentTable, ...]:
    rows: list[list[str]] = []
    for line in text.splitlines():
        if "|" not in line:
            continue
        values = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if values and not all(re.fullmatch(r":?-{2,}:?", cell) for cell in values):
            rows.append(values)
    if not rows:
        return ()
    column_count = max(len(row) for row in rows)
    cells = tuple(DocumentCell(row=i, column=j, text=value, page=1, bbox=None) for i, row in enumerate(rows) for j, value in enumerate(row))
    return (DocumentTable(page=1, row_count=len(rows), column_count=column_count, cells=cells),)


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "line_item"
