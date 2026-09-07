"""Object storage behind an interface (Agent.md §4: storage sits behind an
interface; call sites never touch a vendor SDK directly)."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import Request

from app.config import Settings


class StorageError(Exception):
    pass


@dataclass
class UploadTarget:
    url: str
    expires_at: datetime


class StorageBackend:
    """Base class — all implementations must produce presigned upload URLs."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def create_upload_url(self, storage_key: str, content_type: str) -> UploadTarget:
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    """MVP dev backend: serves a signed redirect that the API turns into a
    local-disk PUT. This keeps real uploads working in a demo without S3.

    Files land in the API container's /data/storage volume. Not suitable for
    production — swap in S3StorageBackend when object storage is provisioned.
    """

    def create_upload_url(self, storage_key: str, content_type: str) -> UploadTarget:
        expires = datetime.now(UTC) + timedelta(minutes=15)
        token = f"{expires.timestamp()}:{storage_key}"
        signed = "sha256" + token  # placeholder signature for local dev
        url = f"/internal/storage/{quote(storage_key)}?signature={signed}"
        return UploadTarget(url=url, expires_at=expires)


class S3StorageBackend(StorageBackend):
    """S3-compatible (R2/MinIO) presigned PUT. boto3 is imported lazily so unit
    tests and the LocalStorageBackend don't need it installed."""

    def create_upload_url(self, storage_key: str, content_type: str) -> UploadTarget:
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=self.settings.s3_endpoint_url or None,
            aws_access_key_id=self.settings.s3_access_key,
            aws_secret_access_key=self.settings.s3_secret_key,
            region_name=self.settings.s3_region,
        )
        expires = timedelta(minutes=15)
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.settings.s3_bucket,
                "Key": storage_key,
                "ContentType": content_type,
            },
            ExpiresIn=int(expires.total_seconds()),
        )
        return UploadTarget(url=url, expires_at=datetime.now(UTC) + expires)


def get_storage_backend(settings: Settings) -> StorageBackend:
    if settings.s3_bucket:
        return S3StorageBackend(settings)
    return LocalStorageBackend(settings)


def public_url(storage_key: str, request: Request) -> str:
    """Best-effort public URL for display purposes — not used for download in MVP."""
    return str(request.base_url).rstrip("/") + "/internal/storage/" + quote(storage_key)