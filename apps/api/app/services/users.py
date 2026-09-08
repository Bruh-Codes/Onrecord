import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Role
from app.models.user import User
from app.services.auth_link import auth_user_business_id


async def ensure_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    role: Role,
    business_id: uuid.UUID | None,
    institution_id: uuid.UUID | None,
) -> None:
    """apps/api holds no credentials-Better Auth (apps/web) does-but FK
    columns like document.uploaded_by need a local `user` row to point at.
    Lazily mirror the JWT's identity into `user` on first sight rather than
    requiring a separate sync job (Agent.md §4 auth decision)."""

    existing = await session.get(User, user_id)
    if existing is not None:
        return
    session.add(User(id=user_id, role=role, business_id=business_id, institution_id=institution_id))
    await session.flush()


async def resolve_business_id(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    token_business_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Resolve ownership across the auth row, API mirror, and stale JWT."""
    linked_business_id = await auth_user_business_id(session, user_id)
    if linked_business_id is not None:
        return linked_business_id

    user = await session.get(User, user_id)
    if user is not None and user.business_id is not None:
        return user.business_id
    return token_business_id
