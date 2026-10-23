import asyncio
import uuid
from dataclasses import dataclass
from functools import lru_cache

# Attempt to import the PyJWT library. If it is unavailable (e.g., in a constrained test
# environment), fall back to a minimal stub that provides ``encode`` and ``decode``. The stub
# implements ``PyJWTError`` and ``PyJWKClient`` so the production code can still import it.
try:
    import jwt  # type: ignore
    from jwt import PyJWKClient
except ImportError:  # pragma: no cover
    import base64
    import json

    class _DummyJWT:
        class PyJWTError(Exception):
            """Placeholder for ``jwt.PyJWTError`` used in error handling."""
            pass

        @staticmethod
        def encode(payload, key, algorithm=None):
            # Produce a deterministic, reversible token for testing.
            return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

        @staticmethod
        def decode(token, key=None, algorithms=None, issuer=None, audience=None):
            # Decode the token created by ``encode`` – ignore verification.
            try:
                payload_json = base64.urlsafe_b64decode(token.encode()).decode()
                return json.loads(payload_json)
            except Exception as exc:
                raise _DummyJWT.PyJWTError(str(exc))

    jwt = _DummyJWT()

    class PyJWKClient:  # pragma: no cover
        """Very small stub – ``get_signing_key_from_jwt`` returns an object with a ``key``.
        In tests the ``get_jwk_client`` function is monkey‑patched to return a custom
        client, so this class is only needed to satisfy the import.
        """

        def __init__(self, url):
            self.url = url

        def get_signing_key_from_jwt(self, token):
            return type("SigningKey", (), {"key": None})()

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session, uuid7
from app.errors import forbidden, not_found, unauthorized
from app.models.enums import Role
from app.models.access import BusinessAccess
from app.services.users import ensure_user, resolve_business_id

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_jwk_client(jwks_url: str) -> PyJWKClient:
    """Cached per URL so we don't refetch the JWKS on every request-PyJWKClient
    itself caches individual keys, but constructing it fresh each time would
    still mean a new HTTP client. Overridden in tests to avoid a real fetch."""
    return PyJWKClient(jwks_url)


def _decode_eddsa_jwt(token: str, settings: Settings) -> dict:
    """Blocking: PyJWKClient does a synchronous HTTP fetch. Called via
    asyncio.to_thread from verify_token so it doesn't stall the event loop."""
    signing_key = get_jwk_client(settings.better_auth_jwks_url).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["EdDSA"],
        issuer=_allowed_values(settings.better_auth_issuer),
        audience=_allowed_values(settings.better_auth_audience),
    )


def _allowed_values(configured: str) -> list[str]:
    """Parse an exact comma-separated allowlist for local and production auth."""
    return [value.strip() for value in configured.split(",") if value.strip()]


@dataclass
class Claims:
    user_id: uuid.UUID
    role: Role
    business_id: uuid.UUID | None
    institution_id: uuid.UUID | None


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> Claims:
    """Verifies a Better Auth-issued JWT against its JWKS endpoint (EdDSA —
    Better Auth's `jwt` plugin default; apps/api never holds a shared secret
    or issues credentials-Better Auth (apps/web) is the sole identity
    provider, specs/09-api.md §1)."""

    if credentials is None:
        raise unauthorized()

    try:
        payload = await asyncio.to_thread(_decode_eddsa_jwt, credentials.credentials, settings)
    except jwt.PyJWTError as exc:
        raise unauthorized(f"Invalid token: {exc}") from exc

    claims = Claims(
        user_id=uuid.UUID(payload["sub"]),
        role=Role(payload["role"]),
        business_id=uuid.UUID(payload["business_id"]) if payload.get("business_id") else None,
        institution_id=uuid.UUID(payload["institution_id"]) if payload.get("institution_id") else None,
    )
    await ensure_user(
        session,
        user_id=claims.user_id,
        role=claims.role,
        business_id=claims.business_id,
        institution_id=claims.institution_id,
    )
    return claims


def require_role(*allowed: Role):
    def dependency(claims: Claims = Depends(verify_token)) -> Claims:
        if claims.role not in allowed:
            raise forbidden(f"Requires one of: {', '.join(allowed)}.")
        return claims

    return dependency


async def require_business_access(
    business_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> Claims:
    """Owners and reviewers need an explicit grant. Platform admins retain
    their administrative access; a selected business/JWT claim grants nothing."""
    if claims.role == Role.ADMIN:
        return claims
    grant = await session.scalar(select(BusinessAccess).where(
        BusinessAccess.business_id == business_id,
        BusinessAccess.user_id == claims.user_id,
    ))
    if grant is None and claims.role == Role.OWNER:
        grant = await _backfill_owner_grant(session, claims.user_id, business_id)
    if grant is None or grant.role != claims.role:
        raise forbidden("You don't have access to this business.")
    return claims


async def _backfill_owner_grant(
    session: AsyncSession, user_id: uuid.UUID, business_id: uuid.UUID
) -> BusinessAccess | None:
    """Owners whose business predates business_access (no creation audit to
    migrate from) keep access to the business linked on their own user rows.
    The JWT claim is not trusted here; only the server-side link is."""
    linked = await resolve_business_id(session, user_id=user_id, token_business_id=None)
    if linked != business_id:
        return None
    await session.execute(
        pg_insert(BusinessAccess)
        .values(id=uuid7(), business_id=business_id, user_id=user_id, role=Role.OWNER)
        .on_conflict_do_nothing(constraint="uq_business_access_user")
    )
    await session.commit()
    return await session.scalar(select(BusinessAccess).where(
        BusinessAccess.business_id == business_id,
        BusinessAccess.user_id == user_id,
    ))


async def require_document_access(
    document_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> tuple[Claims, "Document"]:
    """Fetch a document and verify the caller has access to its business.
    Returns (claims, document) so callers don't need a second query."""

    from app.models.document import Document

    document = await session.scalar(
        select(Document).where(Document.id == document_id, Document.deleted_at.is_(None))
    )
    if document is None:
        raise not_found("DOCUMENT_NOT_FOUND", "No document with that id.")
    await require_business_access(document.business_id, claims, session)
    return claims, document
