"""Compare a connected sheet with what OnRecord already has, and apply the difference.

A row is known by its fingerprint (what it says) plus an occurrence number for
identical rows, so re-sorting a sheet changes nothing. A changed row shows up
as one row gone and one new, and is paired back up as an edit when it sits at
the same place or keeps its date and description.

Edits and deletions of rows older than OLD_AFTER_DAYS wait for the owner, and
until then the ledger keeps the earlier figures. That stops last quarter's
sales from changing quietly just before a loan application.
"""

import statistics
from collections import Counter
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.sheet_sync import SheetConnection, SheetRow
from app.models.transaction import Transaction
from app.services.sheet_sync import google, records
from app.services.sheet_sync.parsing import (
    ParsedRow,
    header_signature,
    normalise,
    parse_rows,
)

OLD_AFTER_DAYS = 30
LARGE_AMOUNT_FACTOR = 10
LARGE_AMOUNT_MIN_PESEWAS = 100_000
LARGE_AMOUNT_MIN_ROWS = 20
# Rows that stay in step with the sheet. "removed" and "kept" rows have left it.
LIVE = ("recorded", "needs_review", "skipped")


def sync_connection(session: Session, connection: SheetConnection, token: str, *, force: bool = False) -> dict:
    """Check Google for changes and apply them. Network errors raise GoogleSheetError."""
    now = datetime.now(UTC)
    info = google.file_info(token, connection.spreadsheet_id)
    if info.get("trashed"):
        raise google.GoogleSheetError("SHEET_TRASHED", "This spreadsheet is in the Google Drive bin. Restore it to keep syncing.")
    connection.spreadsheet_name = info.get("name") or connection.spreadsheet_name
    modified = info.get("modifiedTime")
    connection.last_checked_at = now
    if not force and connection.last_synced_at and modified and modified == connection.remote_modified_at:
        return {"changed": False}
    connection.sheet_title = google.tab_title(token, connection.spreadsheet_id, connection.sheet_gid)
    values = google.read_values(token, connection.spreadsheet_id, connection.sheet_title)
    result = apply_values(session, connection, values, now=now)
    if connection.status == "active":
        connection.remote_modified_at = modified
    return result


def apply_values(
    session: Session, connection: SheetConnection, values: list[list], *, now: datetime | None = None, today: date | None = None,
) -> dict:
    now = now or datetime.now(UTC)
    today = today or now.date()
    mapping = connection.mapping or {}
    signature = header_signature(values, mapping)
    if mapping.get("header_signature") and signature != mapping["header_signature"]:
        connection.status = "needs_mapping"
        connection.last_error = "The columns in your sheet changed. Check the column setup so OnRecord keeps reading it correctly."
        return {"changed": True, "paused": "columns_changed"}
    if not mapping.get("header_signature"):
        connection.mapping = {**mapping, "header_signature": signature}

    parsed = parse_rows(values, mapping, today=today)
    current = _keyed(parsed)
    rows = list(session.scalars(select(SheetRow).where(SheetRow.connection_id == connection.id)))
    if mapping.get("rekey"):
        _rekey(session, connection, rows, parsed)
        connection.mapping = {key: value for key, value in (connection.mapping or {}).items() if key != "rekey"}
    live = {(row.fingerprint, row.occurrence): row for row in rows if row.status in LIVE}
    gone = {(row.fingerprint, row.occurrence): row for row in rows if row.status not in LIVE}
    sync = _Sync(session, connection, now, today, initial=connection.last_synced_at is None)

    added = [key for key in current if key not in live]
    removed = {key: row for key, row in live.items() if key not in current}
    for key in current.keys() & live.keys():
        live[key].row_number, live[key].last_seen_at = current[key].row_number, now

    fresh = []
    for key in added:
        if key in gone:
            sync.reappeared(gone[key], current[key])
        else:
            fresh.append(key)
    pairs, fresh = _pair_edits(fresh, current, removed)
    for key, row in pairs:
        removed.pop((row.fingerprint, row.occurrence))
        sync.edited(row, current[key], key)
    for key in fresh:
        sync.added(current[key], key)
    for row in removed.values():
        sync.removed(row)

    connection.status = "active"
    connection.last_error = None
    connection.last_synced_at = now
    connection.last_result = {**sync.counts, "rows_in_sheet": len(parsed), "synced_at": now.isoformat()}
    session.flush()
    return {"changed": True, **connection.last_result}


def _rekey(session: Session, connection: SheetConnection, rows: list[SheetRow], parsed: list[ParsedRow]) -> None:
    """The owner changed the column setup. A row that still reads as the same
    record at the same place keeps its history and is not counted as an edit;
    anything else is left to the normal comparison."""
    by_position = {row.row_number: row for row in parsed}
    key_of = {id(row): key for key, row in _keyed(parsed).items()}
    live = [row for row in rows if row.status in LIVE]
    moves = {}
    for row in live:
        match = by_position.get(row.row_number)
        if match is not None and match.record and match.record == row.parsed:
            moves[row.id] = (key_of[id(match)], match)
    taken = {key for key, _ in moves.values()}
    original = {row.id: (row.fingerprint, row.occurrence) for row in live}
    for row in live:
        # Free every unique (fingerprint, occurrence) slot before reassigning.
        row.fingerprint, row.occurrence = f"rekey-{row.id.hex}", 0
    session.flush()
    for row in live:
        if row.id in moves:
            (row.fingerprint, row.occurrence), match = moves[row.id]
            row.values = match.values
        elif original[row.id] in taken:
            row.status, row.review_reason = "removed", None
            records.remove_record(session, row)
        else:
            row.fingerprint, row.occurrence = original[row.id]
    session.flush()


def _keyed(parsed: list[ParsedRow]) -> dict[tuple[str, int], ParsedRow]:
    seen: Counter[str] = Counter()
    keyed = {}
    for row in parsed:
        keyed[(row.fingerprint, seen[row.fingerprint])] = row
        seen[row.fingerprint] += 1
    return keyed


def _pair_edits(fresh: list, current: dict, removed: dict) -> tuple[list, list]:
    """Match new rows to vanished ones: same position first, then same date and description."""
    pairs, unpaired = [], []
    by_position = {row.row_number: row for row in removed.values()}
    taken: set = set()
    for key in fresh:
        old = by_position.get(current[key].row_number)
        if old is not None and old.id not in taken:
            pairs.append((key, old))
            taken.add(old.id)
        else:
            unpaired.append(key)
    still = []
    for key in unpaired:
        new = current[key].record
        candidates = [
            row for row in removed.values()
            if row.id not in taken and new and row.parsed and _same_entry(row.parsed, new)
        ]
        if len(candidates) == 1:
            pairs.append((key, candidates[0]))
            taken.add(candidates[0].id)
        else:
            still.append(key)
    return pairs, still


def _same_entry(old: dict, new: dict) -> bool:
    same_text = normalise(old.get("description") or "") == normalise(new.get("description") or "")
    if not same_text or old.get("direction") != new.get("direction"):
        return False
    return old.get("occurred_on") == new.get("occurred_on") or old.get("amount_pesewas") == new.get("amount_pesewas")


class _Sync:
    def __init__(self, session: Session, connection: SheetConnection, now: datetime, today: date, *, initial: bool):
        self.session, self.connection, self.now, self.today, self.initial = session, connection, now, today, initial
        self.counts = {"added": 0, "edited": 0, "removed": 0, "needs_review": 0}
        self._typical: dict[str, int | None] = {}

    def added(self, parsed: ParsedRow, key: tuple[str, int]) -> None:
        row = SheetRow(
            connection_id=self.connection.id, fingerprint=key[0], occurrence=key[1], row_number=parsed.row_number,
            values=parsed.values, parsed=parsed.record, status="needs_review", first_seen_at=self.now,
            last_seen_at=self.now, initial_import=self.initial, history=[],
        )
        self.session.add(row)
        self.session.flush()
        self._decide_new(row, parsed)

    def _decide_new(self, row: SheetRow, parsed: ParsedRow) -> None:
        reason = None
        if parsed.issues or not parsed.record:
            reason = "unreadable"
        elif records.hand_entered_match(self.session, self.connection.business_id, parsed.record):
            reason = "possible_duplicate"
        elif not self.initial and self._unusually_large(parsed.record):
            reason = "large_amount"
        if reason:
            row.status, row.review_reason = "needs_review", reason
            self.counts["needs_review"] += 1
            return
        records.record_row(self.session, self.connection, row)
        self.counts["added"] += 1

    def edited(self, row: SheetRow, parsed: ParsedRow, key: tuple[str, int]) -> None:
        row.history = [*(row.history or []), {
            "event": "edited_in_sheet", "at": self.now.isoformat(), "before": row.parsed or {"values": row.values},
        }]
        was_old = self._is_old(row)
        row.fingerprint, row.occurrence = key
        row.row_number, row.values, row.parsed, row.last_seen_at = parsed.row_number, parsed.values, parsed.record, self.now
        self.session.flush()
        if row.transaction_id is None:
            self._decide_new(row, parsed)
        elif parsed.issues or not parsed.record:
            # The ledger keeps the last readable figures until the row is fixed.
            row.status, row.review_reason = "needs_review", "unreadable"
            self.counts["needs_review"] += 1
        elif was_old:
            row.status, row.review_reason = "needs_review", "old_edit"
            self.counts["needs_review"] += 1
        else:
            records.apply_edit(self.session, self.connection, row)
            self.counts["edited"] += 1

    def removed(self, row: SheetRow) -> None:
        row.history = [*(row.history or []), {"event": "removed_from_sheet", "at": self.now.isoformat()}]
        if row.transaction_id and self._is_old(row):
            # Kept in totals until the owner confirms the deletion.
            row.status, row.review_reason = "removed", "old_removal"
            self.counts["needs_review"] += 1
            return
        records.remove_record(self.session, row)
        row.status, row.review_reason = "removed", None
        self.counts["removed"] += 1

    def reappeared(self, row: SheetRow, parsed: ParsedRow) -> None:
        row.history = [*(row.history or []), {"event": "back_in_sheet", "at": self.now.isoformat()}]
        row.row_number, row.last_seen_at = parsed.row_number, self.now
        if row.transaction_id:
            row.status, row.review_reason = "recorded", None
        else:
            self._decide_new(row, parsed)

    def _is_old(self, row: SheetRow) -> bool:
        cutoff = self.today - timedelta(days=OLD_AFTER_DAYS)
        occurred = (row.parsed or {}).get("occurred_on")
        first_seen = row.first_seen_at.date() if row.first_seen_at else self.today
        return bool(occurred and date.fromisoformat(occurred) < cutoff) or first_seen < cutoff

    def _unusually_large(self, record: dict) -> bool:
        direction = record["direction"]
        if direction not in self._typical:
            amounts = list(self.session.scalars(select(Transaction.amount_pesewas).where(
                Transaction.account_id == self.connection.account_id,
                Transaction.direction == direction,
            ))) if self.connection.account_id else []
            self._typical[direction] = int(statistics.median(amounts)) if len(amounts) >= LARGE_AMOUNT_MIN_ROWS else None
        typical = self._typical[direction]
        amount = record["amount_pesewas"]
        return typical is not None and amount >= LARGE_AMOUNT_MIN_PESEWAS and amount > typical * LARGE_AMOUNT_FACTOR
