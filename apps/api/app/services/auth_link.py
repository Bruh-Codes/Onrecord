"""Bridge to apps/web's Better Auth tables.

apps/api and apps/web share one Postgres database (apps/web/lib/auth.ts:
"apps/api's domain model already has its own user and account tables in the
same Postgres database"). The auth tables live under the `auth_` prefix and
hold the custom fields `businessId` / `institutionId` (camelCase-the built-in
Kysely adapter does not snake_case custom columns).

This does NOT invent a parallel auth system. Authentication stays 100% with
Better Auth (apps/web)-the JWT carries `sub`, and Better Auth owns the user
tables. These helpers only:
  1. populate the pre-declared `businessId` field after the owner's business is
     created (the write-back apps/web/lib/auth.ts documents as pending);
  2. read it back server-side, because resource ownership must be verified
     server-side anyway (specs/09-api.md §2.4) and the JWT claim is a cache
     that is stale until the session refreshes.

`businessId` is marked `input: false` in apps/web, so Better Auth itself (e.g.
auth.api.updateUser) refuses to set it-its maintainers' guidance for such
fields is to write through the DB adapter directly (see better-auth issue
#7314). Both apps already share the same database by design."""

import uuid

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

_AUTH_USER_BUSINESS_ID = '"businessId"'
_AUTH_USER_INSTITUTION_ID = '"institutionId"'

_TABLE_MISSING_MARKERS = ("auth_user", "does not exist", "relation")


def _auth_tables_missing(exc: ProgrammingError) -> bool:
    msg = getattr(exc, "orig", None) or exc
    return any(marker.lower() in str(msg).lower() for marker in _TABLE_MISSING_MARKERS)


async def auth_user_business_id(session: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    """Current business recorded on auth_user (source of truth). None when the
    auth tables aren't provisioned yet (e.g. domain-only test DBs)."""
    try:
        async with session.begin_nested():
            row = await session.execute(
                text(f"SELECT {_AUTH_USER_BUSINESS_ID} AS bid FROM auth_user WHERE id = :uid"),
                {"uid": str(user_id)},
            )
            bid = row.scalar()
    except ProgrammingError as exc:
        if _auth_tables_missing(exc):
            return None
        raise
    return uuid.UUID(bid) if bid else None


async def set_auth_user_business_id(
    session: AsyncSession, user_id: uuid.UUID, business_id: uuid.UUID
) -> None:
    """Record the owner's business on their Better Auth user row. Runs inside
    the caller's transaction (caller controls commit)."""
    try:
        async with session.begin_nested():
            await session.execute(
                text(f"UPDATE auth_user SET {_AUTH_USER_BUSINESS_ID} = :bid WHERE id = :uid"),
                {"bid": str(business_id), "uid": str(user_id)},
            )
    except ProgrammingError as exc:
        if not _auth_tables_missing(exc):
            raise


async def auth_user_institution_id(session: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    try:
        async with session.begin_nested():
            row = await session.execute(
                text(f"SELECT {_AUTH_USER_INSTITUTION_ID} AS iid FROM auth_user WHERE id = :uid"),
                {"uid": str(user_id)},
            )
            iid = row.scalar()
    except ProgrammingError as exc:
        if _auth_tables_missing(exc):
            return None
        raise
    return uuid.UUID(iid) if iid else None
