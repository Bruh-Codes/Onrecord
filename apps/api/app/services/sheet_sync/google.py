"""Read a connected Google Sheet on the owner's behalf.

Google sign-in lives in apps/web (Better Auth), which stores the owner's tokens
in auth_account in the shared Postgres database (see app/services/auth_link.py
for the same bridge). The background sync needs to read the sheet while the
owner is away, so it refreshes the access token here with the same Google
OAuth client and writes the new one back, keeping Better Auth's copy current.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings

TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets"
MAX_ROWS = 5000
_TIMEOUT = 30


class GoogleSheetError(Exception):
    """A problem the owner can fix. `code` is stable; `message` is shown as-is."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def reconnect_error() -> GoogleSheetError:
    return GoogleSheetError("GOOGLE_RECONNECT", "Google access has expired. Reconnect Google Sheets in Integrations.")


@dataclass
class GoogleTokens:
    account_id: str
    access_token: str | None
    refresh_token: str | None
    expires_at: datetime | None


def load_tokens(session: Session, user_id) -> GoogleTokens:
    row = session.execute(
        text(
            'SELECT id, "accessToken", "refreshToken", "accessTokenExpiresAt" FROM auth_account '
            'WHERE "userId" = :user_id AND "providerId" = \'google\' '
            'ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1'
        ),
        {"user_id": str(user_id)},
    ).first()
    if row is None:
        raise GoogleSheetError("GOOGLE_NOT_CONNECTED", "Connect Google Sheets in Integrations first.")
    expires_at = row[3]
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return GoogleTokens(str(row[0]), row[1], row[2], expires_at)


def needs_refresh(tokens: GoogleTokens, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return not tokens.access_token or tokens.expires_at is None or tokens.expires_at <= now + timedelta(minutes=2)


def refresh(tokens: GoogleTokens) -> GoogleTokens:
    """Swap the refresh token for a new access token (network call only)."""
    settings = get_settings()
    if not tokens.refresh_token or not settings.google_client_id or not settings.google_client_secret:
        raise reconnect_error()
    try:
        response = httpx.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": tokens.refresh_token,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
        }, timeout=_TIMEOUT)
    except httpx.HTTPError as exc:
        raise GoogleSheetError("GOOGLE_UNREACHABLE", "Google could not be reached. OnRecord will try again.") from exc
    if response.status_code in (400, 401):
        raise reconnect_error()
    if response.is_error:
        raise GoogleSheetError("GOOGLE_UNREACHABLE", "Google could not be reached. OnRecord will try again.")
    payload = response.json()
    return GoogleTokens(
        tokens.account_id,
        payload["access_token"],
        payload.get("refresh_token") or tokens.refresh_token,
        datetime.now(UTC) + timedelta(seconds=int(payload.get("expires_in", 3600))),
    )


def save_tokens(session: Session, tokens: GoogleTokens) -> None:
    session.execute(
        text(
            'UPDATE auth_account SET "accessToken" = :access, "refreshToken" = :refresh, '
            '"accessTokenExpiresAt" = :expires, "updatedAt" = now() WHERE id = :id'
        ),
        {"access": tokens.access_token, "refresh": tokens.refresh_token, "expires": tokens.expires_at, "id": tokens.account_id},
    )


def access_token(session: Session, user_id) -> str:
    """For the worker, where blocking on Google is fine. The caller commits."""
    tokens = load_tokens(session, user_id)
    if needs_refresh(tokens):
        tokens = refresh(tokens)
        save_tokens(session, tokens)
    return tokens.access_token or ""


def _get(url: str, token: str, params: dict | None = None) -> dict:
    try:
        response = httpx.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT)
    except httpx.HTTPError as exc:
        raise GoogleSheetError("GOOGLE_UNREACHABLE", "Google could not be reached. OnRecord will try again.") from exc
    if response.status_code == 401:
        raise reconnect_error()
    if response.status_code == 403:
        raise GoogleSheetError("GOOGLE_NO_ACCESS", "OnRecord no longer has permission to read this spreadsheet. Reconnect it.")
    if response.status_code == 404:
        raise GoogleSheetError("SHEET_NOT_FOUND", "This spreadsheet was deleted or is no longer shared with you.")
    if response.status_code == 429:
        raise GoogleSheetError("GOOGLE_BUSY", "Google asked OnRecord to slow down. It will try again shortly.")
    if response.is_error:
        raise GoogleSheetError("GOOGLE_UNREACHABLE", f"Google returned an error ({response.status_code}). OnRecord will try again.")
    return response.json()


def file_info(token: str, spreadsheet_id: str) -> dict:
    """Name, last change time and whether it is in the bin. Cheap enough to poll."""
    return _get(f"{DRIVE_FILES_URL}/{quote(spreadsheet_id, safe='')}", token, {"fields": "id,name,modifiedTime,trashed"})


def tabs(token: str, spreadsheet_id: str) -> list[dict]:
    data = _get(
        f"{SHEETS_URL}/{quote(spreadsheet_id, safe='')}", token,
        {"fields": "properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"},
    )
    return [
        {"sheet_gid": sheet["properties"]["sheetId"], "title": sheet["properties"]["title"],
         "row_count": sheet["properties"].get("gridProperties", {}).get("rowCount")}
        for sheet in data.get("sheets", [])
    ]


def tab_title(token: str, spreadsheet_id: str, sheet_gid: int) -> str:
    """Tabs can be renamed; the gid stays the same."""
    for tab in tabs(token, spreadsheet_id):
        if tab["sheet_gid"] == sheet_gid:
            return tab["title"]
    raise GoogleSheetError("SHEET_TAB_MISSING", "The tab OnRecord was reading has been deleted from the spreadsheet.")


def read_values(token: str, spreadsheet_id: str, title: str) -> list[list]:
    escaped = title.replace("'", "''")
    data = _get(
        f"{SHEETS_URL}/{quote(spreadsheet_id, safe='')}/values/{quote(f"'{escaped}'!A1:Z{MAX_ROWS}", safe='')}",
        token,
        {"valueRenderOption": "UNFORMATTED_VALUE", "dateTimeRenderOption": "SERIAL_NUMBER", "majorDimension": "ROWS"},
    )
    return data.get("values", [])
