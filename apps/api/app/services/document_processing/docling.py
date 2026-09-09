"""Docling adapter used by workers, keeping vendor-specific imports isolated."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProcessedDocument:
    text: str
    page_count: int


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
        )
