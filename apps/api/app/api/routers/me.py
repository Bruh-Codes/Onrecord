import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, verify_token
from app.db import get_session
from app.models.business import Business
from app.models.enums import Role
from app.schemas.business import BusinessDetail
from app.services.auth_link import auth_user_institution_id
from app.services.users import resolve_business_id

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    role: Role
    business_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None = None
    business: BusinessDetail | None = None


@router.get("/v1/me", response_model=MeOut)
async def get_me(
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    """The authenticated user's context. business_id/institution_id come from
    the Better Auth row (source of truth) so a business created after sign-in
    is visible immediately, falling back to the JWT claim (cache)."""

    business_id = await resolve_business_id(
        session, user_id=claims.user_id, token_business_id=claims.business_id
    )
    institution_id = await auth_user_institution_id(session, claims.user_id) or claims.institution_id

    business = None
    if business_id is not None:
        row = await session.get(Business, business_id)
        if row is not None:
            business = BusinessDetail.from_model(row)

    return MeOut(
        user_id=claims.user_id,
        role=claims.role,
        business_id=business_id,
        institution_id=institution_id,
        business=business,
    )
