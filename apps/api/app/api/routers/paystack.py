"""Connected Paystack account: connect with a secret key, sync now, disconnect.

The key is checked against Paystack, encrypted, and never sent back. Reading
happens in the worker (app/workers/paystack_tasks.py), the same code for the
5-minute sweep and Sync now.
"""

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.db import get_session
from app.errors import AppError, not_found
from app.models.enums import Role
from app.models.paystack import PaystackConnection
from app.models.transaction import Transaction
from app.schemas.paystack import PaystackConnect, PaystackConnectionOut
from app.services.audit import write_audit_event
from app.services.paystack import secrets
from app.services.paystack.client import PaystackClient, PaystackError

router = APIRouter(tags=["paystack"])


def _owner_only(claims: Claims) -> None:
    if claims.role not in (Role.OWNER, Role.ADMIN):
        raise AppError("FORBIDDEN", "Only the business owner can connect Paystack.", 403)


async def _live(session: AsyncSession, business_id: uuid.UUID) -> PaystackConnection | None:
    return await session.scalar(select(PaystackConnection).where(
        PaystackConnection.business_id == business_id, PaystackConnection.status != "disconnected",
    ))


async def _out(session: AsyncSession, connection: PaystackConnection) -> dict:
    payments = records = 0
    if connection.account_id:
        is_payment = Transaction.provider_reference.like("txn:%")
        records, payments = (await session.execute(
            select(func.count(), func.count().filter(is_payment)).where(Transaction.account_id == connection.account_id)
        )).one()
    return {
        **{column: getattr(connection, column) for column in (
            "id", "status", "mode", "key_last4", "last_checked_at", "last_synced_at", "last_error", "last_result", "created_at",
        )},
        "payments": payments,
        "records": records,
    }


def _queue(connection_id: uuid.UUID) -> None:
    from app.workers.paystack_tasks import sync_paystack

    sync_paystack.delay(str(connection_id))


def _check_key(secret_key: str) -> None:
    with PaystackClient(secret_key) as client:
        client.check_key()


@router.get("/v1/businesses/{business_id}/paystack", response_model=PaystackConnectionOut | None)
async def get_connection(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict | None:
    connection = await _live(session, business_id)
    return await _out(session, connection) if connection else None


@router.put("/v1/businesses/{business_id}/paystack", response_model=PaystackConnectionOut)
async def connect(
    business_id: uuid.UUID,
    body: PaystackConnect,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Connect Paystack, or replace the key of the account already connected."""
    _owner_only(claims)
    secret_key = body.secret_key.strip()
    try:
        mode = secrets.check_format(secret_key)
        ciphertext = secrets.encrypt(secret_key)
        await asyncio.to_thread(_check_key, secret_key)
    except secrets.PaystackKeyError as error:
        status = 503 if error.code == "PAYSTACK_NOT_CONFIGURED" else 422
        raise AppError(error.code, error.message, status) from error
    except PaystackError as error:
        if error.code == "PAYSTACK_KEY_REJECTED":
            raise AppError(error.code, "Paystack didn't accept that key. Copy the secret key again from Paystack.", 422) from error
        raise AppError(error.code, "Couldn't reach Paystack just now. Try again in a minute.", 502) from error

    connection = await _live(session, business_id)
    if connection is not None and connection.mode != mode:
        # Test and live are separate ledgers; switching starts the other one.
        connection.status, connection.key_ciphertext, connection.disconnected_at = "disconnected", None, datetime.now(UTC)
        await session.flush()
        connection = None
    action = "paystack_connection.replace_key"
    if connection is None:
        action = "paystack_connection.create"
        # Reconnecting picks up the ledger it had, so nothing is added twice.
        previous = await session.scalar(select(PaystackConnection).where(
            PaystackConnection.business_id == business_id, PaystackConnection.mode == mode,
        ).order_by(PaystackConnection.created_at.desc()).limit(1))
        connection = PaystackConnection(
            business_id=business_id, connected_by=claims.user_id, mode=mode, last_result={},
            account_id=previous.account_id if previous else None,
            document_id=previous.document_id if previous else None,
            synced_through=previous.synced_through if previous else None,
        )
        session.add(connection)
    connection.key_ciphertext, connection.key_last4 = ciphertext, secret_key[-4:]
    connection.status, connection.last_error = "active", None
    await session.flush()
    await write_audit_event(session, business_id=business_id, actor=claims.user_id, action=action,
                            target=f"paystack_connection:{connection.id}",
                            after={"mode": mode, "key_last4": connection.key_last4})
    await session.commit()
    _queue(connection.id)
    await session.refresh(connection)
    return await _out(session, connection)


@router.post("/v1/businesses/{business_id}/paystack/sync", status_code=202)
async def sync_now(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _live(session, business_id)
    if connection is None:
        raise not_found("PAYSTACK_NOT_CONNECTED", "Paystack isn't connected.")
    _queue(connection.id)
    return {"queued": True}


@router.delete("/v1/businesses/{business_id}/paystack", status_code=204)
async def disconnect(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Stop reading Paystack and delete the key. Records already in OnRecord stay."""
    _owner_only(claims)
    connection = await _live(session, business_id)
    if connection is not None:
        connection.status, connection.disconnected_at = "disconnected", datetime.now(UTC)
        connection.key_ciphertext = None
        await write_audit_event(session, business_id=business_id, actor=claims.user_id,
                                action="paystack_connection.disconnect", target=f"paystack_connection:{connection.id}")
        await session.commit()
    return Response(status_code=204)
