"""Local document understanding behind a provider-neutral interface."""

from app.services.document_processing.docling import DoclingProcessor, ProcessedDocument

__all__ = ["DoclingProcessor", "ProcessedDocument"]
