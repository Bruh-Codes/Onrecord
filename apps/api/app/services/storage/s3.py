from datetime import UTC, datetime, timedelta

import boto3

from app.config import get_settings

_UPLOAD_URL_TTL = timedelta(minutes=15)


class S3StorageBackend:
    """S3-compatible backend (MinIO in local dev, R2/S3 in production — Agent.md §4).

    `generate_presigned_url` never makes a network call: it's a local SigV4
    computation over the configured endpoint URL. That's what lets
    `storage_endpoint_url` safely be the browser-facing host even though this
    code runs in a different container — see app/config.py's comment.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.storage_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint_url,
            aws_access_key_id=settings.storage_access_key,
            aws_secret_access_key=settings.storage_secret_key,
            region_name=settings.storage_region,
        )

    def create_upload_url(self, key: str, mime: str) -> tuple[str, datetime]:
        url = self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": mime},
            ExpiresIn=int(_UPLOAD_URL_TTL.total_seconds()),
        )
        return url, datetime.now(UTC) + _UPLOAD_URL_TTL
