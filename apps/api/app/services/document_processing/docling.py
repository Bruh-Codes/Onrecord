"""Provider-neutral document capture.

Docling is one adapter in this module, not the application's data model. Every
input is normalized into text plus lossless tables first; downstream parsers
may then interpret that representation for transactions, invoices, or
financial statements.
"""

import csv
import io
import posixpath
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


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
    methods: tuple[str, ...] = ("docling",)
    warnings: tuple[str, ...] = ()


class DocumentProcessor:
    """Capture supported files into a common representation.

    Delimited files and XLSX workbooks are read natively because sending a
    spreadsheet through a layout model can lose sheet boundaries, blank
    cells, or column meaning. PDFs, images, and office documents use Docling
    and keep its layout JSON for provenance.
    """

    def process(self, source: Path) -> ProcessedDocument:
        suffix = source.suffix.lower()
        if suffix in {".csv", ".tsv", ".txt"}:
            return _process_delimited(source)
        if suffix == ".xml":
            return _process_xml(source)
        if suffix in {".xlsx", ".xlsm"}:
            try:
                return _process_xlsx(source)
            except (OSError, ValueError, zipfile.BadZipFile, ElementTree.ParseError):
                # Some banks use an xlsx extension for a generated PDF/HTML
                # export. Docling is the safe fallback for those files.
                processed = DoclingProcessor().process(source)
                return ProcessedDocument(
                    **{**processed.__dict__, "warnings": processed.warnings + ("native_spreadsheet_reader_fallback",)}
                )
        return DoclingProcessor().process(source)


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
            methods=("docling",),
        )


def _process_delimited(source: Path) -> ProcessedDocument:
    raw = source.read_bytes()
    decoded = _decode_bytes(raw)
    if source.suffix.lower() == ".tsv":
        delimiter = "\t"
    else:
        sample = decoded[:8192]
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        except csv.Error:
            delimiter = ","
    rows = [list(row) for row in csv.reader(io.StringIO(decoded), delimiter=delimiter)]
    rows = _trim_empty_rows(rows)
    is_tabular = source.suffix.lower() != ".txt" or any(len(row) > 1 for row in rows)
    tables = (_table_from_rows(rows, page=1),) if rows and is_tabular else ()
    return ProcessedDocument(
        text=_rows_to_markdown(rows) if is_tabular else decoded,
        page_count=1 if rows else 0,
        structure={"kind": "delimited", "delimiter": delimiter, "tables": [{"rows": rows, "page": 1}]},
        tables=tables,
        methods=("native:delimited",),
    )


def _process_xlsx(source: Path) -> ProcessedDocument:
    with zipfile.ZipFile(source) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {
            relationship.attrib["Id"]: relationship.attrib["Target"]
            for relationship in relationships
        }
        rows_by_sheet: list[tuple[str, list[list[str]]]] = []
        for sheet in workbook.findall(".//{*}sheet"):
            relation_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = rel_targets.get(relation_id or "")
            if not target:
                continue
            target = target.lstrip("/")
            sheet_path = posixpath.normpath(target if target.startswith("xl/") else posixpath.join("xl", target))
            if sheet_path not in archive.namelist():
                continue
            xml = ElementTree.fromstring(archive.read(sheet_path))
            rows_by_sheet.append((sheet.attrib.get("name", "Sheet"), _xlsx_rows(xml, shared_strings)))

    nonempty_sheets = [(name, rows) for name, rows in rows_by_sheet if rows]
    tables = tuple(_table_from_rows(rows, page=index + 1) for index, (_, rows) in enumerate(nonempty_sheets))
    markdown = []
    for name, rows in nonempty_sheets:
        markdown.append(f"## {name}\n{_rows_to_markdown(rows)}")
    return ProcessedDocument(
        text="\n\n".join(markdown),
        page_count=len(tables),
        structure={"kind": "xlsx", "sheets": [{"name": name, "rows": rows} for name, rows in rows_by_sheet]},
        tables=tables,
        methods=("native:xlsx",),
    )


def _process_xml(source: Path) -> ProcessedDocument:
    root = ElementTree.fromstring(source.read_bytes())
    tables: list[DocumentTable] = []
    repeated_paths: set[int] = set()
    for parent in root.iter():
        children_by_tag: dict[str, list[ElementTree.Element]] = {}
        for child in list(parent):
            children_by_tag.setdefault(_xml_tag(child), []).append(child)
        for tag, records in children_by_tag.items():
            if len(records) < 2:
                continue
            field_names = list(dict.fromkeys(_xml_tag(child) for record in records for child in list(record)))
            if not field_names:
                continue
            rows = [[_xml_text(next((child for child in list(record) if _xml_tag(child) == field), None)) for field in field_names] for record in records]
            tables.append(_table_from_rows([field_names, *rows], page=len(tables) + 1))
            repeated_paths.update(id(record) for record in records)

    metadata = _xml_metadata_rows(root, repeated_paths)
    if metadata:
        tables.insert(0, _table_from_rows([["Field", "Value"], *metadata], page=1))
    text_parts = [f"{_xml_tag(root)}\n"]
    for table in tables:
        text_parts.append(_table_to_markdown(table))
    return ProcessedDocument(
        text="\n\n".join(text_parts),
        page_count=max(1, len(tables)),
        structure={
            "kind": "xml",
            "root": _xml_tag(root),
            "metadata": metadata,
            "tables": [{"page": table.page, "rows": _table_rows(table)} for table in tables],
        },
        tables=tuple(tables),
        methods=("native:xml",),
    )


def _xml_metadata_rows(root: ElementTree.Element, repeated_paths: set[int]) -> list[list[str]]:
    rows: list[list[str]] = []

    def visit(node: ElementTree.Element, path: str) -> None:
        if id(node) in repeated_paths:
            return
        children = list(node)
        if not children:
            value = _xml_text(node)
            if value:
                rows.append([path, value])
            return
        for child in children:
            visit(child, f"{path}.{_xml_tag(child)}")

    visit(root, _xml_tag(root))
    return rows


def _xml_tag(node: ElementTree.Element) -> str:
    return node.tag.rsplit("}", maxsplit=1)[-1]


def _xml_text(node: ElementTree.Element | None) -> str:
    return "".join(node.itertext()).strip() if node is not None else ""


def _table_rows(table: DocumentTable) -> list[list[str]]:
    by_row: dict[int, dict[int, str]] = {}
    for cell in table.cells:
        by_row.setdefault(cell.row, {})[cell.column] = cell.text
    return [[values.get(column, "") for column in range(table.column_count)] for _, values in sorted(by_row.items())]


def _table_to_markdown(table: DocumentTable) -> str:
    return _rows_to_markdown(_table_rows(table))


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.itertext()) for node in root.findall(".//{*}si")]


def _xlsx_rows(root: ElementTree.Element, shared_strings: list[str]) -> list[list[str]]:
    indexed: dict[int, dict[int, str]] = {}
    for row in root.findall(".//{*}sheetData/{*}row"):
        row_number = int(row.attrib.get("r", "1")) - 1
        for cell in row.findall("{*}c"):
            reference = cell.attrib.get("r", "")
            match = re.match(r"([A-Z]+)", reference.upper())
            if not match:
                continue
            column = 0
            for character in match.group(1):
                column = column * 26 + ord(character) - ord("A") + 1
            column -= 1
            value = cell.find("{*}v")
            inline = cell.find("{*}is")
            text = "".join(inline.itertext()) if inline is not None else (value.text if value is not None and value.text else "")
            if cell.attrib.get("t") == "s" and text.isdigit() and int(text) < len(shared_strings):
                text = shared_strings[int(text)]
            indexed.setdefault(row_number, {})[column] = text
    if not indexed:
        return []
    width = max(max(row) for row in indexed.values()) + 1
    return [[values.get(column, "") for column in range(width)] for _, values in sorted(indexed.items())]


def _table_from_rows(rows: list[list[str]], page: int) -> DocumentTable:
    width = max((len(row) for row in rows), default=0)
    padded = [row + [""] * (width - len(row)) for row in rows]
    cells = tuple(
        DocumentCell(row=row_index, column=column_index, text=value, page=page, bbox=None, column_header=row_index == 0)
        for row_index, row in enumerate(padded)
        for column_index, value in enumerate(row)
    )
    return DocumentTable(page=page, row_count=len(padded), column_count=width, cells=cells)


def _rows_to_markdown(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    output = ["| " + " | ".join(row) + " |" for row in rows]
    if len(rows) > 1:
        output.insert(1, "| " + " | ".join("---" for _ in rows[0]) + " |")
    return "\n".join(output)


def _trim_empty_rows(rows: list[list[str]]) -> list[list[str]]:
    return [row for row in rows if any(cell.strip() for cell in row)]


def _decode_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


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
