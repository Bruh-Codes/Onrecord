from datetime import datetime
from typing import Protocol

from app.services.storage.s3 import S3StorageBackend


class StorageBackend(Protocol):
    """Every external storage vendor sits behind this interface (Agent.md §4)
    — call sites depend on this, never on boto3/an SDK directly."""

    def create_upload_url(self, key: str, mime: str) -> tuple[str, datetime]:
        """Returns (upload_url, expires_at). Caller PUTs the file body to
        upload_url with a Content-Type header matching `mime`."""
        ...


def get_storage_backend() -> StorageBackend:
    return S3StorageBackend()


__all__ = ["StorageBackend", "get_storage_backend"]
