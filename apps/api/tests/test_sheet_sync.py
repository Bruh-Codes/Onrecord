"""Connected Google Sheets: connect, confirm columns, sync, and keep history of changes.

Google is replaced by an in-memory sheet; the sync runs the worker code in-process.
"""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Transaction
from app.services.sheet_sync import google
from tests.conftest import bearer_header

TODAY = datetime.now(UTC).date()


def _d(days_ago: int) -> str:
    return (TODAY - timedelta(days=days_ago)).strftime("%d/%m/%Y")


class FakeSheet:
    def __init__(self, rows):
        self.rows = rows
        self.version = 1

    def set(self, rows):
        self.rows = rows
        self.version += 1


@pytest.fixture
def sheet(monkeypatch):
    fake = FakeSheet([])
    tokens = google.GoogleTokens("acct", "token", "refresh", datetime.now(UTC) + timedelta(hours=1))
    monkeypatch.setattr(google, "load_tokens", lambda session, user_id: tokens)
    monkeypatch.setattr(google, "file_info", lambda token, sid: {
        "id": sid, "name": "Ama Shop Books", "modifiedTime": f"v{fake.version}", "trashed": False,
    })
    monkeypatch.setattr(google, "tab_title", lambda token, sid, gid: "Cash book")
    monkeypatch.setattr(google, "read_values", lambda token, sid, title: [list(row) for row in fake.rows])
    return fake


@pytest.fixture
def run_worker(db_ready, monkeypatch):
    """Sync now and the mapping confirmation run the real worker task, synchronously."""
    from app.db import engine_sync
    from app.workers import sheet_tasks, tasks

    # Tables are recreated per test; drop pooled connections holding old plans.
    engine_sync.dispose()
    monkeypatch.setattr(tasks.recompute, "delay", lambda *args: SimpleNamespace(id="x"))

    def run(connection_id, force=False):
        with Session(engine_sync) as session:
            return sheet_tasks.run_sync(session, uuid.UUID(connection_id), force=force)

    monkeypatch.setattr(sheet_tasks.sync_sheet, "delay", run)
    return run


async def _owner(client):
    uid = uuid.uuid4()
    created = await client.post("/v1/businesses", json={"legal_name": "Ama Provisions", "entity_type": "sole_prop"},
                                headers=bearer_header(role="owner", user_id=uid))
    assert created.status_code == 201, created.text
    bid = created.json()["id"]
    return bearer_header(role="owner", user_id=uid, business_id=uuid.UUID(bid)), bid


HEADER = ["Date", "Details", "Money in", "Money out", "Category"]


async def _connect(client, headers, bid, sheet, rows):
    sheet.set(rows)
    created = await client.post(f"/v1/businesses/{bid}/sheet-connections", headers=headers, json={
        "spreadsheet_id": "1AbcDefGhiJklMnoPqr", "spreadsheet_name": "Ama Shop Books", "sheet_gid": 0, "sheet_title": "Cash book",
    })
    assert created.status_code == 201, created.text
    connection = created.json()
    assert connection["status"] == "needs_mapping"
    return connection


async def _ledger(client, headers, bid):
    listed = (await client.get(f"/v1/businesses/{bid}/money/transactions", headers=headers)).json()
    return sorted((item["description"], item["amount_pesewas"]) for item in listed["items"])


async def test_connect_confirm_and_sync_new_rows(client, sheet, run_worker):
    headers, bid = await _owner(client)
    connection = await _connect(client, headers, bid, sheet, [
        ["Ama Provisions 2026"],
        HEADER,
        [_d(5), "Sold rice", 300, "", "Sales of goods"],
        [_d(4), "Trotro fare", "", 12.5, ""],
        [_d(3), "Kwame", 50, "", ""],
        ["", "Total", 350, 12.5, ""],
    ])
    mapping = connection["mapping"]
    assert mapping["header_row"] == 2
    preview = (await client.post(f"/v1/sheet-connections/{connection['id']}/preview", headers=headers, json={})).json()
    assert preview["problems"] == [] and preview["data_rows"] == 3
    assert preview["rows"][0]["record"]["amount_pesewas"] == 30000

    confirmed = await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": mapping})
    assert confirmed.status_code == 200, confirmed.text
    assert await _ledger(client, headers, bid) == [("Kwame", 5000), ("Sold rice", 30000), ("Trotro fare", 1250)]

    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    assert detail["status"] == "active" and detail["counts"]["recorded"] == 3
    assert detail["last_result"]["added"] == 3

    # Nothing changed in Google: a sync is a cheap check that adds nothing.
    assert run_worker(connection["id"]) == {"changed": False}

    # A new row at the end, plus re-sorting: only the new row is added.
    sheet.set([["Ama Provisions 2026"], HEADER,
               [_d(4), "Trotro fare", "", 12.5, ""],
               [_d(5), "Sold rice", 300, "", "Sales of goods"],
               [_d(3), "Kwame", 50, "", ""],
               [_d(1), "Shop rent", "", 400, "Rent"]])
    result = run_worker(connection["id"])
    assert (result["added"], result["edited"], result["removed"]) == (1, 0, 0)
    assert ("Shop rent", 40000) in await _ledger(client, headers, bid)

    listed = (await client.get(f"/v1/businesses/{bid}/sheet-connections", headers=headers)).json()
    assert [item["id"] for item in listed] == [connection["id"]]


async def test_recent_edits_apply_and_old_ones_wait_for_the_owner(client, sheet, run_worker, db_ready):
    headers, bid = await _owner(client)
    rows = [HEADER, [_d(60), "Old sale", 1000, "", ""], [_d(2), "New sale", 200, "", ""], [_d(1), "Fuel", "", 80, ""]]
    connection = await _connect(client, headers, bid, sheet, rows)
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})

    sheet.set([HEADER, [_d(60), "Old sale", 5000, "", ""], [_d(2), "New sale", 250, "", ""]])
    result = run_worker(connection["id"])
    assert (result["edited"], result["removed"], result["needs_review"]) == (1, 1, 1)
    # The recent edit applied; the old one keeps its earlier figure until the owner decides.
    assert await _ledger(client, headers, bid) == [("New sale", 25000), ("Old sale", 100000)]

    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    [pending] = detail["review_rows"]
    assert pending["review_reason"] == "old_edit" and pending["actions"] == ["accept", "keep"]
    assert pending["history"][0]["before"]["amount_pesewas"] == 100000
    edited = next(row for row in detail["changed_rows"] if (row["parsed"] or {}).get("description") == "New sale")
    assert edited["history"][0]["event"] == "edited_in_sheet"

    from app.workers.tasks import recompute
    accepted = await client.post(f"/v1/sheet-rows/{pending['id']}/review", headers=headers, json={"action": "accept"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "recorded"
    assert await _ledger(client, headers, bid) == [("New sale", 25000), ("Old sale", 500000)]

    async with db_ready.connect() as conn:
        txn = (await conn.execute(select(Transaction.flags, Transaction.provenance).where(
            Transaction.description == "Old sale"))).one()
    assert txn.flags["sheet_edits"][0]["before"]["amount_pesewas"] == 100000
    assert len(txn.provenance["extraction_ids"]) == 2
    assert recompute  # imported to keep the monkeypatched delay referenced


async def test_old_deleted_rows_stay_until_the_owner_confirms(client, sheet, run_worker):
    headers, bid = await _owner(client)
    connection = await _connect(client, headers, bid, sheet, [HEADER, [_d(90), "Big expense", "", 900, ""], [_d(1), "Sale", 100, "", ""]])
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})

    sheet.set([HEADER, [_d(1), "Sale", 100, "", ""]])
    run_worker(connection["id"])
    assert ("Big expense", 90000) in await _ledger(client, headers, bid)
    [pending] = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()["review_rows"]
    assert pending["review_reason"] == "old_removal"

    removed = await client.post(f"/v1/sheet-rows/{pending['id']}/review", headers=headers, json={"action": "remove"})
    assert removed.json()["status"] == "removed"
    assert await _ledger(client, headers, bid) == [("Sale", 10000)]
    bad = await client.post(f"/v1/sheet-rows/{pending['id']}/review", headers=headers, json={"action": "keep"})
    assert bad.status_code == 422


async def test_unreadable_rows_and_typed_duplicates_go_to_review(client, sheet, run_worker):
    headers, bid = await _owner(client)
    typed = await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json={
        "direction": "in", "occurred_on": (TODAY - timedelta(days=2)).isoformat(), "amount_pesewas": 20000,
        "category": "Sales of goods", "description": "Rice sale",
    })
    assert typed.status_code == 201, typed.text
    connection = await _connect(client, headers, bid, sheet, [
        HEADER, ["someday", "Mystery", 10, "", ""], [_d(2), "Rice", 200, "", ""], [_d(1), "Beans", 50, "", ""],
    ])
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})
    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    reasons = sorted(row["review_reason"] for row in detail["review_rows"])
    assert reasons == ["possible_duplicate", "unreadable"]

    # Fixing the row in the sheet turns it into a record on the next sync.
    sheet.set([HEADER, [_d(3), "Mystery", 10, "", ""], [_d(2), "Rice", 200, "", ""], [_d(1), "Beans", 50, "", ""]])
    run_worker(connection["id"])
    assert ("Mystery", 1000) in await _ledger(client, headers, bid)
    duplicate = next(row for row in (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()["review_rows"])
    await client.post(f"/v1/sheet-rows/{duplicate['id']}/review", headers=headers, json={"action": "skip"})
    ledger = await _ledger(client, headers, bid)
    assert ledger.count(("Rice sale", 20000)) == 1 and ("Rice", 20000) not in ledger


async def test_changed_columns_pause_the_sync_and_remapping_rereads_in_place(client, sheet, run_worker):
    headers, bid = await _owner(client)
    connection = await _connect(client, headers, bid, sheet, [HEADER, [_d(2), "Sale", 100, "", ""]])
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})

    sheet.set([["Date", "Notes", "Details", "Money in", "Money out"], [_d(2), "", "Sale", 100, ""]])
    run_worker(connection["id"])
    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    assert detail["status"] == "needs_mapping" and "columns" in detail["last_error"]

    # The preview suggests a fresh guess for the new layout.
    preview = (await client.post(f"/v1/sheet-connections/{connection['id']}/preview", headers=headers, json={})).json()
    guessed = preview["mapping"]["columns"]
    assert (guessed["description"], guessed["money_in"], guessed["money_out"]) == (2, 3, 4)
    remap = preview["mapping"]
    confirmed = await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": remap})
    assert confirmed.status_code == 200, confirmed.text
    assert await _ledger(client, headers, bid) == [("Sale", 10000)]
    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    assert detail["status"] == "active" and detail["counts"] == {"recorded": 1, "in_ledger": 1}


async def test_google_problems_are_shown_not_thrown(client, sheet, run_worker, monkeypatch):
    headers, bid = await _owner(client)
    connection = await _connect(client, headers, bid, sheet, [HEADER, [_d(2), "Sale", 100, "", ""]])
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})

    def expired(*args):
        raise google.reconnect_error()
    monkeypatch.setattr(google, "file_info", expired)
    assert run_worker(connection["id"], True) == {"error": "GOOGLE_RECONNECT"}
    detail = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()
    assert detail["status"] == "needs_attention" and "Reconnect" in detail["last_error"]
    bell = (await client.get(f"/v1/businesses/{bid}/notifications", headers=headers)).json()
    assert any("needs attention" in item["title"] for item in bell["items"])


async def test_other_businesses_cannot_see_a_connected_sheet(client, sheet, run_worker):
    headers, bid = await _owner(client)
    connection = await _connect(client, headers, bid, sheet, [HEADER, [_d(2), "Sale", 100, "", ""]])
    other_headers, _ = await _owner(client)
    assert (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=other_headers)).status_code == 403
    assert (await client.delete(f"/v1/sheet-connections/{connection['id']}", headers=headers)).status_code == 204
    assert (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).status_code == 404


async def test_large_amounts_after_the_first_import_wait_for_a_look(client, sheet, run_worker):
    headers, bid = await _owner(client)
    rows = [HEADER, *([_d(day), f"Sale {day}", 100, "", ""] for day in range(1, 25))]
    connection = await _connect(client, headers, bid, sheet, rows)
    await client.put(f"/v1/sheet-connections/{connection['id']}/mapping", headers=headers, json={"mapping": connection["mapping"]})
    sheet.set([*rows, [_d(0), "Big order", 5000, "", ""]])
    result = run_worker(connection["id"])
    assert (result["added"], result["needs_review"]) == (0, 1)
    [pending] = (await client.get(f"/v1/sheet-connections/{connection['id']}", headers=headers)).json()["review_rows"]
    assert pending["review_reason"] == "large_amount" and pending["actions"] == ["add", "skip"]
    await client.post(f"/v1/sheet-rows/{pending['id']}/review", headers=headers, json={"action": "add"})
    assert ("Big order", 500000) in await _ledger(client, headers, bid)
