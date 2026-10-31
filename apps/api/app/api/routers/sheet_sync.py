"""Connected spreadsheets: connect a tab, confirm its columns, sync, and review rows.

Google is called from a thread (asyncio.to_thread) and the shared sheet_sync
services run on the async session through run_sync, so the worker and the API
use the same code.
"""

import asyncio
import string
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access, verify_token
from app.config import get_settings
from app.db import get_session
from app.errors import AppError, not_found
from app.models.enums import Role
from app.models.sheet_sync import SheetConnection, SheetRow
from app.schemas.sheet_sync import (
    PreviewRow,
    SheetConnectionCreate,
    SheetConnectionDetail,
    SheetConnectionOut,
    SheetMapping,
    SheetMappingUpdate,
    SheetPreview,
    SheetPreviewRequest,
    SheetReviewAction,
    SheetRowOut,
)
from app.services.audit import write_audit_event
from app.services.sheet_sync import google, review
from app.services.sheet_sync.detect import mapping_problems, propose_mapping
from app.services.sheet_sync.parsing import cell_text, parse_rows

router = APIRouter(tags=["sheet-sync"])

_PREVIEW_ROWS = 8


def _google_error(error: google.GoogleSheetError) -> AppError:
    status = 409 if error.code in ("GOOGLE_NOT_CONNECTED", "GOOGLE_RECONNECT", "GOOGLE_NO_ACCESS") else 502
    return AppError(error.code, error.message, status)


async def _token(session: AsyncSession, user_id: uuid.UUID) -> str:
    try:
        tokens = await session.run_sync(lambda sync: google.load_tokens(sync, user_id))
        if google.needs_refresh(tokens):
            tokens = await asyncio.to_thread(google.refresh, tokens)
            await session.run_sync(lambda sync: google.save_tokens(sync, tokens))
            await session.commit()
    except google.GoogleSheetError as error:
        raise _google_error(error) from error
    return tokens.access_token or ""


async def _read(session: AsyncSession, connection: SheetConnection, user_id: uuid.UUID) -> list[list]:
    token = await _token(session, user_id)
    try:
        title = await asyncio.to_thread(google.tab_title, token, connection.spreadsheet_id, connection.sheet_gid)
        connection.sheet_title = title
        return await asyncio.to_thread(google.read_values, token, connection.spreadsheet_id, title)
    except google.GoogleSheetError as error:
        raise _google_error(error) from error


async def _connection(session: AsyncSession, connection_id: uuid.UUID, claims: Claims) -> SheetConnection:
    connection = await session.get(SheetConnection, connection_id)
    if connection is None or connection.status == "disconnected":
        raise not_found("SHEET_CONNECTION_NOT_FOUND", "No connected sheet with that id.")
    await require_business_access(connection.business_id, claims, session)
    return connection


def _owner_only(claims: Claims) -> None:
    if claims.role not in (Role.OWNER, Role.ADMIN):
        raise AppError("FORBIDDEN", "Only the business owner can change connected sheets.", 403)


async def _counts(session: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    counts: dict[uuid.UUID, dict[str, int]] = {connection_id: {} for connection_id in ids}
    if not ids:
        return counts
    rows = await session.execute(
        select(SheetRow.connection_id, SheetRow.status, func.count())
        .where(SheetRow.connection_id.in_(ids)).group_by(SheetRow.connection_id, SheetRow.status)
    )
    for connection_id, status, count in rows.all():
        counts[connection_id][status] = count
    pending = await session.execute(
        select(SheetRow.connection_id, func.count())
        .where(SheetRow.connection_id.in_(ids), review.needs_review_filter()).group_by(SheetRow.connection_id)
    )
    for connection_id, count in pending.all():
        counts[connection_id]["to_review"] = count
    in_ledger = await session.execute(
        select(SheetRow.connection_id, func.count())
        .where(SheetRow.connection_id.in_(ids), SheetRow.transaction_id.is_not(None)).group_by(SheetRow.connection_id)
    )
    for connection_id, count in in_ledger.all():
        counts[connection_id]["in_ledger"] = count
    return counts


def _out(connection: SheetConnection, counts: dict[str, int]) -> dict:
    mapping = connection.mapping
    clean = {key: mapping[key] for key in ("header_row", "columns", "default_direction", "date_order") if key in mapping} if mapping else None
    return {
        **{column: getattr(connection, column) for column in (
            "id", "business_id", "spreadsheet_id", "spreadsheet_name", "sheet_gid", "sheet_title", "status",
            "mapping_confirmed_at", "document_id", "last_checked_at", "last_synced_at", "last_error", "created_at",
        )},
        "mapping": clean,
        "last_result": connection.last_result or {},
        "counts": counts,
    }


def _row_out(row: SheetRow) -> SheetRowOut:
    return SheetRowOut(
        id=row.id, row_number=row.row_number, values=row.values, parsed=row.parsed, status=row.status,
        review_reason=row.review_reason, actions=list(review.ACTIONS.get(row.review_reason or "", ())),
        transaction_id=row.transaction_id, first_seen_at=row.first_seen_at, history=row.history or [],
    )


def _column_names(width: int) -> list[str]:
    letters = string.ascii_uppercase
    return [letters[index] if index < 26 else letters[index // 26 - 1] + letters[index % 26] for index in range(width)]


def _preview(values: list[list], mapping: dict) -> SheetPreview:
    width = max((len(row) for row in values[:200]), default=0)
    header_row = int(mapping.get("header_row") or 0)
    header = [cell_text(value) for value in values[header_row - 1]] if 0 < header_row <= len(values) else []
    parsed = parse_rows(values, mapping)
    return SheetPreview(
        mapping=SheetMapping.model_validate({**mapping, "columns": {k: v for k, v in mapping["columns"].items()}}),
        header=header + [""] * (width - len(header)),
        columns=_column_names(width),
        rows=[PreviewRow(row_number=row.row_number, values=row.values, record=row.record, issues=row.issues)
              for row in parsed[:_PREVIEW_ROWS]],
        problems=mapping_problems(mapping, width),
        data_rows=len(parsed),
    )


@router.get("/v1/businesses/{business_id}/sheet-connections", response_model=list[SheetConnectionOut])
async def list_connections(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    connections = (await session.scalars(select(SheetConnection).where(
        SheetConnection.business_id == business_id, SheetConnection.status != "disconnected",
    ).order_by(SheetConnection.created_at))).all()
    counts = await _counts(session, [connection.id for connection in connections])
    return [_out(connection, counts[connection.id]) for connection in connections]


@router.post("/v1/businesses/{business_id}/sheet-connections", response_model=SheetConnectionOut, status_code=201)
async def create_connection(
    business_id: uuid.UUID,
    body: SheetConnectionCreate,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _owner_only(claims)
    existing = await session.scalar(select(SheetConnection).where(
        SheetConnection.business_id == business_id, SheetConnection.spreadsheet_id == body.spreadsheet_id,
        SheetConnection.sheet_gid == body.sheet_gid, SheetConnection.status != "disconnected",
    ))
    if existing is not None:
        return _out(existing, (await _counts(session, [existing.id]))[existing.id])
    connection = SheetConnection(
        business_id=business_id, connected_by=claims.user_id, spreadsheet_id=body.spreadsheet_id,
        spreadsheet_name=body.spreadsheet_name, sheet_gid=body.sheet_gid, sheet_title=body.sheet_title,
        status="needs_mapping", last_result={},
    )
    values = await _read(session, connection, claims.user_id)
    if not any(any(cell_text(cell) for cell in row) for row in values):
        raise AppError("SHEET_EMPTY", "That tab is empty. Choose the tab where you keep your records.", 422)
    connection.mapping = propose_mapping(values)
    session.add(connection)
    await session.flush()
    await write_audit_event(session, business_id=business_id, actor=claims.user_id, action="sheet_connection.create",
                            target=f"sheet_connection:{connection.id}",
                            after={"spreadsheet_name": body.spreadsheet_name, "sheet_title": body.sheet_title})
    await session.commit()
    return _out(connection, {})


@router.get("/v1/sheet-connections/{connection_id}", response_model=SheetConnectionDetail)
async def get_connection(
    connection_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _connection(session, connection_id, claims)
    to_review = (await session.scalars(
        select(SheetRow).where(SheetRow.connection_id == connection.id, review.needs_review_filter())
        .order_by(SheetRow.row_number).limit(200)
    )).all()
    changed = (await session.scalars(
        select(SheetRow).where(SheetRow.connection_id == connection.id, func.jsonb_array_length(SheetRow.history) > 0)
        .order_by(SheetRow.last_seen_at.desc()).limit(50)
    )).all()
    counts = (await _counts(session, [connection.id]))[connection.id]
    return {
        **_out(connection, counts),
        "review_rows": [_row_out(row) for row in to_review],
        "changed_rows": [_row_out(row) for row in changed],
    }


@router.post("/v1/sheet-connections/{connection_id}/preview", response_model=SheetPreview)
async def preview_connection(
    connection_id: uuid.UUID,
    body: SheetPreviewRequest,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> SheetPreview:
    connection = await _connection(session, connection_id, claims)
    values = await _read(session, connection, connection.connected_by)
    if body.mapping:
        mapping = body.mapping.model_dump()
    elif connection.mapping and not (connection.status == "needs_mapping" and connection.mapping_confirmed_at):
        mapping = connection.mapping
    else:
        # First setup, or the columns changed since the owner last confirmed them.
        mapping = propose_mapping(values)
    return _preview(values, mapping)


@router.put("/v1/sheet-connections/{connection_id}/mapping", response_model=SheetConnectionOut)
async def confirm_mapping(
    connection_id: uuid.UUID,
    body: SheetMappingUpdate,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _connection(session, connection_id, claims)
    _owner_only(claims)
    mapping = body.mapping.model_dump()
    values = await _read(session, connection, connection.connected_by)
    problems = mapping_problems(mapping, max((len(row) for row in values[:200]), default=0))
    if problems:
        raise AppError("SHEET_MAPPING_INVALID", problems[0], 422, {"problems": problems})
    already_synced = connection.last_synced_at is not None
    # header_signature is captured again on the next sync from the new layout.
    connection.mapping = {**mapping, **({"rekey": True} if already_synced else {})}
    connection.mapping_confirmed_at = datetime.now(UTC)
    connection.status, connection.last_error = "active", None
    await write_audit_event(session, business_id=connection.business_id, actor=claims.user_id,
                            action="sheet_connection.mapping", target=f"sheet_connection:{connection.id}",
                            after={"mapping": mapping})
    await session.commit()
    _queue(connection.id, force=True)
    return _out(connection, (await _counts(session, [connection.id]))[connection.id])


def _queue(connection_id: uuid.UUID, *, force: bool = False) -> None:
    from app.workers.sheet_tasks import sync_sheet

    sync_sheet.delay(str(connection_id), force)


@router.post("/v1/sheet-connections/{connection_id}/sync", status_code=202)
async def sync_now(
    connection_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _connection(session, connection_id, claims)
    if connection.status not in ("active", "needs_attention"):
        raise AppError("SHEET_NOT_SYNCING", "Confirm the columns or resume this sheet before syncing.", 409)
    _queue(connection.id, force=True)
    return {"queued": True}


@router.post("/v1/businesses/{business_id}/sheet-connections/sync-stale", status_code=202)
async def sync_stale(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Opening the app checks sheets that haven't been looked at lately, even without the sweep."""
    cutoff = datetime.now(UTC) - timedelta(minutes=get_settings().sheet_sync_interval_minutes)
    ids = (await session.scalars(select(SheetConnection.id).where(
        SheetConnection.business_id == business_id, SheetConnection.status == "active",
        (SheetConnection.last_checked_at.is_(None)) | (SheetConnection.last_checked_at < cutoff),
    ))).all()
    for connection_id in ids:
        _queue(connection_id)
    return {"queued": len(ids)}


@router.post("/v1/sheet-connections/{connection_id}/pause", response_model=SheetConnectionOut)
async def pause(
    connection_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _connection(session, connection_id, claims)
    _owner_only(claims)
    if connection.status in ("active", "needs_attention"):
        connection.status = "paused"
        await session.commit()
    return _out(connection, (await _counts(session, [connection.id]))[connection.id])


@router.post("/v1/sheet-connections/{connection_id}/resume", response_model=SheetConnectionOut)
async def resume(
    connection_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    connection = await _connection(session, connection_id, claims)
    _owner_only(claims)
    if connection.status in ("paused", "needs_attention"):
        connection.status = "active" if connection.mapping_confirmed_at else "needs_mapping"
        connection.last_error = None
        await session.commit()
        if connection.status == "active":
            _queue(connection.id, force=True)
    return _out(connection, (await _counts(session, [connection.id]))[connection.id])


@router.delete("/v1/sheet-connections/{connection_id}", status_code=204)
async def disconnect(
    connection_id: uuid.UUID,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Stop reading the sheet. Records already in OnRecord stay, with their history."""
    connection = await _connection(session, connection_id, claims)
    _owner_only(claims)
    connection.status, connection.disconnected_at = "disconnected", datetime.now(UTC)
    await write_audit_event(session, business_id=connection.business_id, actor=claims.user_id,
                            action="sheet_connection.disconnect", target=f"sheet_connection:{connection.id}")
    await session.commit()
    return Response(status_code=204)


@router.post("/v1/sheet-rows/{row_id}/review", response_model=SheetRowOut)
async def review_row(
    row_id: uuid.UUID,
    body: SheetReviewAction,
    claims: Claims = Depends(verify_token),
    session: AsyncSession = Depends(get_session),
) -> SheetRowOut:
    row = await session.get(SheetRow, row_id)
    if row is None:
        raise not_found("SHEET_ROW_NOT_FOUND", "No sheet row with that id.")
    connection = await _connection(session, row.connection_id, claims)
    _owner_only(claims)
    try:
        await session.run_sync(lambda sync: review.resolve(
            sync, sync.get(SheetConnection, connection.id), sync.get(SheetRow, row.id), body.action, claims.user_id,
        ))
    except review.ReviewError as error:
        raise AppError("SHEET_REVIEW_INVALID", str(error), 422) from error
    await write_audit_event(session, business_id=connection.business_id, actor=claims.user_id,
                            action=f"sheet_row.{body.action}", target=f"sheet_row:{row.id}")
    await session.commit()
    from app.workers.tasks import recompute

    recompute.delay(str(connection.business_id))
    await session.refresh(row)
    return _row_out(row)
