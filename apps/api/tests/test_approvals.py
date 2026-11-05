import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.access import BusinessAccess
from app.models.enums import Role
from app.models.notification import Notification
from tests.conftest import bearer_header
from tests.test_document_review import _document, _reading, _row, _stage


async def _unreconciled_and_owner_confirmed(client, db_ready, seed: bytes):
    owner, business_id, document_id = await _document(client, seed)
    rows = [_row("100.00", "in", "100.00", "A1"), _row("40.00", "out", "90.00", "A2")]
    await _stage(db_ready, document_id, _reading(rows))
    listed = (await client.get(f"/v1/documents/{document_id}/extracted-rows", headers=owner)).json()
    confirmed = await client.post(
        f"/v1/documents/{document_id}/extracted-rows/confirm",
        json={"rows": [{"id": row["id"]} for row in listed["rows"]]},
        headers=owner,
    )
    assert confirmed.status_code == 200, confirmed.text
    return owner, business_id, document_id


async def _grant(db_ready, business_id: str, user_id: uuid.UUID) -> None:
    from app.models.user import User

    async with async_sessionmaker(db_ready, expire_on_commit=False)() as session:
        if await session.get(User, user_id) is None:
            session.add(User(id=user_id, role=Role.REVIEWER))
            await session.flush()
        session.add(BusinessAccess(business_id=uuid.UUID(business_id), user_id=user_id, role=Role.REVIEWER))
        await session.commit()


async def test_admin_sees_held_upload_and_approves_it(client, db_ready, monkeypatch):
    from app.workers.tasks import recompute

    recomputed: list[str] = []
    monkeypatch.setattr(recompute, "delay", lambda business_id: recomputed.append(business_id))
    _, business_id, document_id = await _unreconciled_and_owner_confirmed(client, db_ready, b"approve-me")
    admin = bearer_header(role="admin", user_id=uuid.uuid4())

    queue = await client.get("/v1/approvals", headers=admin)
    assert queue.status_code == 200, queue.text
    item = next(i for i in queue.json() if i["document_id"] == document_id)
    assert item["business_name"] == "Yaw's Tomatoes"
    assert item["balance_check"] == "balance_breaks"
    assert item["waiting_on_owner"] is False
    assert item["transaction_count"] == 2
    assert item["money_in_pesewas"] == 10000

    resolved = await client.post(
        f"/v1/documents/{document_id}/evidence-review/resolve",
        json={"decision": "approved", "note": "Checked against the PDF."},
        headers=admin,
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["scoring_eligible"] is True
    assert business_id in recomputed

    open_ids = [i["document_id"] for i in (await client.get("/v1/approvals", headers=admin)).json()]
    assert document_id not in open_ids
    done = (await client.get("/v1/approvals?state=done", headers=admin)).json()
    decided = next(i for i in done if i["document_id"] == document_id)
    assert decided["review_status"] == "approved"
    assert decided["reviewer_note"] == "Checked against the PDF."


async def test_reviewer_needs_a_grant_for_the_business(client, db_ready):
    _, business_id, document_id = await _unreconciled_and_owner_confirmed(client, db_ready, b"grant-needed")
    reviewer_id = uuid.uuid4()
    reviewer = bearer_header(role="reviewer", user_id=reviewer_id)

    assert (await client.get("/v1/approvals", headers=reviewer)).json() == []
    denied = await client.post(
        f"/v1/documents/{document_id}/evidence-review/resolve",
        json={"decision": "approved", "note": "ok"},
        headers=reviewer,
    )
    assert denied.status_code == 403
    assert (await client.get(f"/v1/approvals/{document_id}/file", headers=reviewer)).status_code == 403

    await _grant(db_ready, business_id, reviewer_id)
    assert [i["document_id"] for i in (await client.get("/v1/approvals", headers=reviewer)).json()] == [document_id]
    allowed = await client.post(
        f"/v1/documents/{document_id}/evidence-review/resolve",
        json={"decision": "approved", "note": "ok"},
        headers=reviewer,
    )
    assert allowed.status_code == 200, allowed.text


async def test_owners_cannot_open_the_queue(client, db_ready):
    owner, _, _ = await _unreconciled_and_owner_confirmed(client, db_ready, b"owner-blocked")
    assert (await client.get("/v1/approvals", headers=owner)).status_code == 403


async def test_rows_the_owner_has_not_checked_cannot_be_approved_but_can_be_rejected(client, db_ready):
    owner, business_id, document_id = await _document(client, b"owner-pending")
    rows = [_row("100.00", "in", "100.00", "B1"), _row("40.00", "out", "90.00", "B2")]
    await _stage(db_ready, document_id, _reading(rows))
    admin = bearer_header(role="admin", user_id=uuid.uuid4())

    item = next(i for i in (await client.get("/v1/approvals", headers=admin)).json() if i["document_id"] == document_id)
    assert item["waiting_on_owner"] is True

    early = await client.post(
        f"/v1/documents/{document_id}/evidence-review/resolve",
        json={"decision": "approved", "note": "ok"},
        headers=admin,
    )
    assert early.status_code == 409

    rejected = await client.post(
        f"/v1/documents/{document_id}/evidence-review/resolve",
        json={"decision": "rejected", "note": "Only 2 of 30 pages were read. Please upload it again."},
        headers=admin,
    )
    assert rejected.status_code == 200, rejected.text

    async with async_sessionmaker(db_ready, expire_on_commit=False)() as session:
        from sqlalchemy import select

        notes = list(await session.scalars(select(Notification).where(
            Notification.business_id == uuid.UUID(business_id), Notification.dedupe_key == f"document:{document_id}",
        )))
    assert notes and "wasn't approved" in notes[0].title
    assert "Only 2 of 30 pages" in notes[0].body


async def test_reviewer_can_open_the_original_file(client, db_ready):
    from types import SimpleNamespace

    from app.api.main import app
    from app.services.storage import get_storage_backend

    _, _, document_id = await _unreconciled_and_owner_confirmed(client, db_ready, b"file-view")
    app.dependency_overrides[get_storage_backend] = lambda: SimpleNamespace(read_bytes=lambda key: b"%PDF-1.4 fake")
    admin = bearer_header(role="admin", user_id=uuid.uuid4())

    response = await client.get(f"/v1/approvals/{document_id}/file", headers=admin)
    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 fake"
    assert response.headers["content-type"].startswith("application/pdf")
