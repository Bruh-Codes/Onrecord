"""Local-dev storage backend.

Presigned PUTs to MinIO/S3 hit the object store directly, so the API never
sees upload bytes in production. When `storage_bucket` is unset (no S3
available), this backend points the client at the API's internal receiver
route instead (app/api/routers/internal_storage.py), which persists bytes to
local disk. Keeps the whole upload → S1 flow runnable without any S3
dependency (Agent.md §4: storage behind an interface).
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from app.config import get_settings

_UPLOAD_URL_TTL = timedelta(minutes=15)


class LocalStorageBackend:
    """Produces a signed relative URL the client PUTs to the API internal route.

    MVP dev backend only — swap in S3StorageBackend when object storage is
    provisioned. The signature is a placeholder sufficient for local dev.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    def create_upload_url(self, key: str, mime: str) -> tuple[str, datetime]:
        expires = datetime.now(UTC) + _UPLOAD_URL_TTL
        signed = f"sha256:{expires.timestamp()}:{key}"
        url = f"/internal/storage/{quote(key)}?signature={signed}"
        return url, expires