import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.db import get_session
from app.errors import not_found
from app.models.business import Business
from app.models.enums import Role
from app.models.user import User
from app.schemas.business import BusinessCreate, BusinessDetail, BusinessPatch
from app.services.audit import write_audit_event
from app.services.auth_link import set_auth_user_business_id

router = APIRouter(prefix="/v1/businesses", tags=["businesses"])


@router.post("", response_model=BusinessDetail, status_code=201)
async def create_business(
    body: BusinessCreate,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> BusinessDetail:
    business = Business(**body.model_dump())
    session.add(business)
    await session.flush()
    await write_audit_event(
        session,
        business_id=business.id,
        actor=claims.user_id,
        action="business.create",
        target=f"business:{business.id}",
        after=body.model_dump(mode="json"),
    )
    await session.commit()

    # Owner only: record the new business on their Better Auth user row so the
    # server-side ownership check (deps.require_business_access) resolves it
    # immediately — the JWT claim is stale until the session refreshes. This
    # is the write-back apps/web/lib/auth.ts documents as pending (see
    # app/services/auth_link.py for why it writes the field directly).
    if claims.role == Role.OWNER:
        await set_auth_user_business_id(session, claims.user_id, business.id)
        user_row = await session.get(User, claims.user_id)
        if user_row is not None:
            user_row.business_id = business.id
        await session.commit()

    return BusinessDetail.from_model(business)


@router.get("/{business_id}", response_model=BusinessDetail)
async def get_business(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> BusinessDetail:
    business = await session.get(Business, business_id)
    if business is None:
        raise not_found("BUSINESS_NOT_FOUND", "No business with that id.")
    return BusinessDetail.from_model(business)


@router.patch("/{business_id}", response_model=BusinessDetail)
async def patch_business(
    business_id: uuid.UUID,
    body: BusinessPatch,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> BusinessDetail:
    business = await session.get(Business, business_id)
    if business is None:
        raise not_found("BUSINESS_NOT_FOUND", "No business with that id.")

    before = {"legal_name": business.legal_name, "premises_status": business.premises_status}
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(business, field, value)

    await write_audit_event(
        session,
        business_id=business.id,
        actor=claims.user_id,
        action="business.patch",
        target=f"business:{business.id}",
        before=before,
        after=updates,
    )
    await session.commit()
    await session.refresh(business)
    return BusinessDetail.from_model(business)
