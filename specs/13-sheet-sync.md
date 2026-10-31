# 13 — Connected spreadsheets (Google Sheets auto-sync)

An owner connects one tab of a Google Sheet. OnRecord keeps reading it and adds
new rows to the ledger without another upload. It never writes to the sheet.

## Flow

1. **Connect** (`POST /v1/businesses/{id}/sheet-connections`): the owner picks a
   spreadsheet (Google Picker with the `drive.file` scope when
   `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` and `NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER`
   are set, otherwise the older full spreadsheet list) and a tab. The API reads it
   and stores a proposed column mapping (`detect.py`, header words first, data
   shape second). Status `needs_mapping`.
2. **Confirm columns** (`POST .../preview`, `PUT .../mapping`): the owner checks a
   preview and confirms. Status `active`; a forced sync is queued.
3. **Sync** (`sheets.sync` Celery task): one cheap Drive `files.get` for
   `modifiedTime`; only if it changed (or Sync now) are the values read
   (`UNFORMATTED_VALUE`, dates as serial numbers) and compared.
4. **Sweep**: `sheets.sync_due` runs every 5 minutes from Celery beat and queues
   sheets not checked in `SHEET_SYNC_INTERVAL_MINUTES` (15). The web app also
   calls `sync-stale` when it opens, so sheets stay current without beat.

## Rows

- A row is known by `sha256` of what it says (date, direction, amount,
  description, category, counterparty, reference, product) plus an occurrence
  number for identical rows. Re-sorting changes nothing.
- New row → transaction on the connection's own cash-book account and
  informal-ledger document, `provenance.value_kind = declared`, one extraction
  per version (INV-2, INV-7). Categories: the sheet's own label if it matches,
  then keyword rules, else `unknown` for the existing AI pass and review queue.
- Changed row (same position, or same date/description) → edit. Rows dated or
  first seen more than 30 days ago wait for the owner (`old_edit`); the ledger
  keeps the earlier figures until then. Every edit is kept in
  `transaction.flags.sheet_edits` and `sheet_row.history`.
- Deleted row → taken out of totals; older rows wait for the owner
  (`old_removal`) and still count until confirmed.
- Waits for the owner: unreadable rows, likely repeats of records typed into
  OnRecord, and amounts over 10× the usual (after the first import).
- Column layout changed (header text over a mapped column differs) → status
  `needs_mapping`; confirming a new mapping re-reads unchanged rows in place.

## Google access

Better Auth (apps/web) holds the owner's Google tokens in `auth_account`. The
worker refreshes them with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (set on
the api and worker services) and writes the new access token back. Lost access
sets status `needs_attention` and a bell item asks the owner to reconnect.
