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
        tables = tuple(_table_from_docling(table) for table in document.tables)
        text = document.export_to_markdown()
        # Some text-based PDFs are routed through the OCR path and Docling can
        # return an empty markdown export when OCR finds no glyphs.  Preserve
        # the embedded text layer as a classification/extraction fallback;
        # scanned PDFs still correctly remain empty and can be handled by OCR.
        if not text.strip() and source.suffix.lower() == ".pdf":
            text = _extract_embedded_pdf_text(source)
        if not text.strip() and tables:
            text = _tables_to_markdown(tables)
        return ProcessedDocument(
            text=text,
            page_count=len(document.pages),
            structure=document.export_to_dict(),
            tables=tables,
        )


def _extract_embedded_pdf_text(source: Path) -> str:
    """Extract a PDF text layer when Docling's markdown export is empty."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(source))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        # A missing/invalid text layer must not fail ingestion; OCR behaviour
        # and the existing unsupported-document response remain unchanged.
        return ""


def _tables_to_markdown(tables: tuple[DocumentTable, ...]) -> str:
    """Expose Docling table cells to the classifier/parser when page text is empty."""
    output: list[str] = []
    for table in tables:
        by_row: dict[int, dict[int, str]] = {}
        for cell in table.cells:
            by_row.setdefault(cell.row, {})[cell.column] = cell.text.strip()
        for row in sorted(by_row):
            values = [by_row[row].get(column, "") for column in range(table.column_count)]
            output.append("| " + " | ".join(values) + " |")
    return "\n".join(output)


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
