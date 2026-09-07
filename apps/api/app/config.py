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

# S3-compatible object store (Agent.md §4: storage sits behind an
    # interface — see app/services/storage/). Local dev default is the
    # docker-compose MinIO. `storage_endpoint_url` deliberately points at
    # whatever the *browser* can reach (not the docker-network hostname):
    # generate_presigned_url() is a local signature computation, it never
    # dials the endpoint, so this only needs to be resolvable by whoever
    # eventually PUTs to the URL — see app/services/storage/s3.py.
    storage_endpoint_url: str = "http://localhost:9000"
    storage_access_key: str = "minioadmin"
    storage_secret_key: str = "minioadmin"
    storage_bucket: str = "sme-documents"
    storage_region: str = "us-east-1"

    # When storage_bucket is unset (e.g. running the API without docker or an
    # object store), the storage backend falls back to a local directory
    # backend instead — see app/services/storage/local.py.
    local_storage_dir: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
