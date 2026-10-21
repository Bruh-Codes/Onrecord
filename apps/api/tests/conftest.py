import os
import uuid
from types import SimpleNamespace

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Never load a developer/production DATABASE_URL into destructive test fixtures.
_test_url = os.environ.get("TEST_DATABASE_URL")
if _test_url:
    from sqlalchemy.engine import make_url
    if not (make_url(_test_url).database or "").endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL database name must end in _test.")
    os.environ["DATABASE_URL"] = _test_url
else:
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://sme:sme@localhost:5432/onrecord_test"

from app import models  # noqa: F401  registers every model
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
    """DB-dependent tests require an explicitly selected disposable Postgres.
    Unavailable configured test databases fail rather than silently skipping.

    NullPool here (not the app's pooled engine) sidesteps a Windows-specific
    asyncpg/ProactorEventLoop teardown crash when a pooled connection is
    terminated outside the task that opened it-pytest-asyncio's per-test
    task boundary triggers exactly that. Not needed under the app's real
    deployment target (Linux), only in this local test harness."""

    if not _test_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated database ending in _test.")
    test_engine = create_async_engine(
        settings.database_url, poolclass=NullPool, connect_args={"timeout": 3}
    )
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        await test_engine.dispose()
        pytest.fail(f"Dedicated test Postgres unavailable ({type(exc).__name__}).")

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def client(db_ready, monkeypatch):
    from app.api import deps
    from app.api.main import app
    from app.workers.tasks import recompute
    monkeypatch.setattr(recompute, "delay", lambda *args: SimpleNamespace(id=str(uuid.uuid4())))

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
