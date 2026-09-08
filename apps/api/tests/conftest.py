import uuid
from types import SimpleNamespace

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import models  # noqa: F401  import registers every table on Base.metadata before create_all runs
from app.config import get_settings
from app.db import Base, get_session

settings = get_settings()

# One Ed25519 keypair per test run, standing in for Better Auth's real JWKS.
# Real requests hit better_auth_jwks_url via PyJWKClient (app/api/deps.py);
# tests stub that lookup instead of running a fake JWKS HTTP server.
_test_private_key = Ed25519PrivateKey.generate()
_test_public_key = _test_private_key.public_key()


@pytest_asyncio.fixture
async def db_ready():
    """DB-dependent tests need a real Postgres-sqlite can't stand in, since we
    rely on native jsonb/enum behaviour (Agent.md §5). Skip cleanly if the
    DATABASE_URL in .env isn't reachable, rather than faking a pass.

    NullPool here (not the app's pooled engine) sidesteps a Windows-specific
    asyncpg/ProactorEventLoop teardown crash when a pooled connection is
    terminated outside the task that opened it-pytest-asyncio's per-test
    task boundary triggers exactly that. Not needed under the app's real
    deployment target (Linux), only in this local test harness."""

    test_engine = create_async_engine(
        settings.database_url, poolclass=NullPool, connect_args={"timeout": 3}
    )
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        await test_engine.dispose()
        pytest.skip(f"Postgres not reachable at {settings.database_url}: {exc}")

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def client(db_ready, monkeypatch):
    from app.api import deps
    from app.api.main import app

    test_session_local = async_sessionmaker(db_ready, expire_on_commit=False)

    async def _override_get_session():
        async with test_session_local() as session:
            yield session

    monkeypatch.setattr(
        deps,
        "get_jwk_client",
        lambda jwks_url: SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_test_public_key)
        ),
    )

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def bearer_header(*, role: str, user_id: uuid.UUID, business_id: uuid.UUID | None = None) -> dict:
    payload = {
        "sub": str(user_id),
        "role": role,
        "business_id": str(business_id) if business_id else None,
        "iss": settings.better_auth_issuer,
        "aud": settings.better_auth_audience,
    }
    token = jwt.encode(payload, _test_private_key, algorithm="EdDSA")
    return {"Authorization": f"Bearer {token}"}
