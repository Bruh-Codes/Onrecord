"""Docling adapter used by workers, keeping vendor-specific imports isolated."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class DocumentCell:
    """Vendor-neutral table cell retained from Docling's layout model."""

    row: int
    column: int
    text: str
    page: int
    bbox: dict[str, Any] | None
    column_header: bool = False
    row_header: bool = False


@dataclass(frozen=True)
class DocumentTable:
    page: int
    row_count: int
    column_count: int
    cells: tuple[DocumentCell, ...]


@dataclass(frozen=True)
class ProcessedDocument:
    text: str
    page_count: int
    structure: dict[str, Any]
    tables: tuple[DocumentTable, ...]


class DoclingProcessor:
    """Extract text, layout, and tables locally with Docling."""

    def process(self, source: Path) -> ProcessedDocument:
        # Import lazily: API-only processes do not need Docling's model runtime.
        from docling.document_converter import DocumentConverter

        result = DocumentConverter().convert(source)
        document = result.document
        return ProcessedDocument(
            text=document.export_to_markdown(),
            page_count=len(document.pages),
            structure=document.export_to_dict(),
            tables=tuple(_table_from_docling(table) for table in document.tables),
        )


def _table_from_docling(table: Any) -> DocumentTable:
    page = table.prov[0].page_no if table.prov else 1
    cells = tuple(
        DocumentCell(
            row=cell.start_row_offset_idx,
            column=cell.start_col_offset_idx,
            text=cell.text,
            page=page,
            bbox=cell.bbox.model_dump(mode="json") if cell.bbox is not None else None,
            column_header=cell.column_header,
            row_header=cell.row_header,
        )
        for cell in table.data.table_cells
    )
    return DocumentTable(
        page=page,
        row_count=table.data.num_rows,
        column_count=table.data.num_cols,
        cells=cells,
    )
