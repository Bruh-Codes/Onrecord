from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://sme:sme@localhost:5432/sme"
    database_url_sync: str = "postgresql+psycopg://sme:sme@localhost:5432/sme"
    redis_url: str = "redis://localhost:6379/0"

    # Better Auth (apps/web) issues these tokens via its `jwt` plugin, which
    # defaults to EdDSA/Ed25519 and is verified against its JWKS endpoint —
    # apps/api never holds a shared secret. iss/aud default to the web app's
    # BASE_URL on the Better Auth side; keep these two in sync with it.
    better_auth_jwks_url: str = "http://localhost:3000/api/auth/jwks"
    better_auth_issuer: str = "http://localhost:3000"
    better_auth_audience: str = "http://localhost:3000"

    max_document_size_bytes: int = 25 * 1024 * 1024
    max_documents_per_batch: int = 50

    # Object storage (S3-compatible). When s3_bucket is unset, the API falls back
    # to the local-dev storage backend (app/services/storage.py).
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    # Local-only storage root for the dev backend; empty means ./var/storage.
    local_storage_dir: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
