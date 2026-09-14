from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://sme:sme@localhost:5432/sme"
    database_url_sync: str = "postgresql+psycopg://sme:sme@localhost:5432/sme"
    redis_url: str = "redis://localhost:6379/0"
    task_always_eager: bool = False

    # Optional semantic pass. Without a provider key, financial extraction
    # stays fully local and unknown structure/concepts remain unclassified.
    llm_provider: Literal["openai", "groq"] = "openai"
    openai_api_key: str = ""
    groq_api_key: str = ""
    llm_base_url: str = ""
    financial_mapping_model: str = "gpt-5.6-luna"
    ona_model: str = ""
    ona_max_questions_per_hour: int = 20

    @property
    def llm_api_key(self) -> str:
        return self.groq_api_key if self.llm_provider == "groq" else self.openai_api_key

    @property
    def agent_model(self) -> str:
        return self.ona_model or self.financial_mapping_model

    @property
    def responses_api_url(self) -> str:
        base_url = self.llm_base_url or (
            "https://api.groq.com/openai/v1"
            if self.llm_provider == "groq"
            else "https://api.openai.com/v1"
        )
        return f"{base_url.rstrip('/')}/responses"

    def responses_options(self) -> dict:
        # Groq's Responses API does not support OpenAI's `store` field. Its
        # GPT-OSS models support the same low reasoning setting; other Groq
        # models receive no reasoning option to avoid a compatibility error.
        if self.llm_provider == "openai":
            return {"store": False, "reasoning": {"effort": "low"}}
        if self.financial_mapping_model.startswith("openai/gpt-oss-"):
            return {"reasoning": {"effort": "low"}}
        return {}

    # Better Auth (apps/web) issues these tokens via its `jwt` plugin, which
    # defaults to EdDSA/Ed25519 and is verified against its JWKS endpoint —
    # apps/api never holds a shared secret. iss/aud default to the web app's
    # BASE_URL on the Better Auth side; keep these two in sync with it.
    better_auth_jwks_url: str = "http://localhost:3000/api/auth/jwks"
    # Comma-separated exact allowlists support a local web client and the
    # deployed Vercel client without accepting arbitrary issuers.
    better_auth_issuer: str = "http://localhost:3000"
    better_auth_audience: str = "http://localhost:3000"

    max_document_size_bytes: int = 25 * 1024 * 1024
    max_documents_per_batch: int = 50

    # Comma-separated browser origins allowed to call this API. The web app
    # calls every endpoint cross-origin with an Authorization header, so this
    # must include its production URL (e.g. https://web-production-1234.up.railway.app).
    cors_allow_origins: str = "http://localhost:3000"

# S3-compatible object store (Agent.md §4: storage sits behind an
    # interface-see app/services/storage/). Local dev default is the
    # docker-compose MinIO. `storage_endpoint_url` deliberately points at
    # whatever the *browser* can reach (not the docker-network hostname):
    # generate_presigned_url() is a local signature computation, it never
    # dials the endpoint, so this only needs to be resolvable by whoever
    # eventually PUTs to the URL-see app/services/storage/s3.py.
    storage_endpoint_url: str = "http://localhost:9000"
    storage_access_key: str = "minioadmin"
    storage_secret_key: str = "minioadmin"
    storage_bucket: str = "sme-documents"
    storage_region: str = "us-east-1"

    # When storage_bucket is unset (e.g. running the API without docker or an
    # object store), the storage backend falls back to a local directory
    # backend instead-see app/services/storage/local.py.
    local_storage_dir: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
