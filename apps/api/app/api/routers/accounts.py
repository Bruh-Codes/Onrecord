import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.db import get_session
from app.errors import not_found
from app.models.business import Account
from app.schemas.account import AccountCreate, AccountDetail
from app.schemas.common import Page
from app.services.audit import write_audit_event

router = APIRouter(prefix="/v1/businesses/{business_id}/accounts", tags=["accounts"])


@router.post("", response_model=AccountDetail, status_code=201)
async def create_account(
    business_id: uuid.UUID,
    body: AccountCreate,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> AccountDetail:
    await require_business_access(business_id, claims)
    existing = await session.scalar(
        select(Account).where(Account.business_id == business_id, Account.identifier_hash == body.identifier_hash)
    )
    if existing is not None:
        raise not_found("ACCOUNT_ALREADY_LINKED", "This account is already linked to the business.")

    account = Account(business_id=business_id, **body.model_dump())
    session.add(account)
    await session.flush()
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="account.create",
        target=f"account:{account.id}",
        after=body.model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(account)
    return AccountDetail.model_validate(account)


@router.get("", response_model=Page[AccountDetail])
async def list_accounts(
    business_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> Page[AccountDetail]:
    await require_business_access(business_id, claims)
    base_query = select(Account).where(Account.business_id == business_id)

    total = await session.scalar(select(func.count()).select_from(base_query.subquery()))
    rows = await session.scalars(
        base_query.order_by(Account.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = [AccountDetail.model_validate(row) for row in rows]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/{account_id}", response_model=AccountDetail)
async def get_account(
    business_id: uuid.UUID,
    account_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> AccountDetail:
    await require_business_access(business_id, claims)
    account = await session.get(Account, account_id)
    if account is None or account.business_id != business_id:
        raise not_found("ACCOUNT_NOT_FOUND", "No account with that id.")
    return AccountDetail.model_validate(account)


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    business_id: uuid.UUID,
    account_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> None:
    await require_business_access(business_id, claims)
    account = await session.get(Account, account_id)
    if account is None or account.business_id != business_id:
        raise not_found("ACCOUNT_NOT_FOUND", "No account with that id.")
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="account.delete",
        target=f"account:{account.id}",
    )
    await session.delete(account)
    await session.commit()