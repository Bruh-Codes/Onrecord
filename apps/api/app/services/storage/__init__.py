from datetime import datetime
from typing import Protocol

from app.config import get_settings
from app.services.storage.local import LocalStorageBackend
from app.services.storage.s3 import S3StorageBackend


class StorageBackend(Protocol):
    """Every external storage vendor sits behind this interface (Agent.md §4)
   -call sites depend on this, never on boto3/an SDK directly."""

    def create_upload_url(self, key: str, mime: str) -> tuple[str, datetime]:
        """Returns (upload_url, expires_at). Caller PUTs the file body to
        upload_url with a Content-Type header matching `mime`."""
        ...

    def read_bytes(self, key: str) -> bytes:
        """Read an uploaded object for background processing."""
        ...


def get_storage_backend() -> StorageBackend:
    """S3/MinIO by default; falls back to the local-dev receiver when no
    storage_bucket is configured."""
    settings = get_settings()
    if settings.storage_bucket:
        return S3StorageBackend()
    return LocalStorageBackend()


__all__ = ["StorageBackend", "get_storage_backend"]
