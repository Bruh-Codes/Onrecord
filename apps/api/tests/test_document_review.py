import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.document import Document
from app.models.transaction import Transaction
from app.pipeline.s3_ai_ingest import stage_reading
from app.services.document_reader import DocumentReading, ReadRow

from tests.conftest import bearer_header


def _row(amount, direction, balance, reference, occurred_on="2026-03-04"):
    return ReadRow(
        occurred_on=occurred_on, description="Payment from 0244123456", counterparty="AMA 0244123456",
        reference=reference, direction=direction, amount=amount, fee=None, levy=None, balance_after=balance,
        category="revenue", page=1, source_ref="page:1",
    )


def _reading(rows):
    return DocumentReading(
        doc_type="momo_statement", provider="MTN MoMo", account_label="4321", currency="GHS",
        period_start=None, period_end=None, opening_balance=None, closing_balance=None,
        confidence=0.9, summary="An MTN statement.", findings=(), rows=tuple(rows), model="claude-opus-5-5",
    )


async def _document(client, sha_seed: bytes, filename: str = "momo.pdf"):
    owner_id = uuid.uuid4()
    creator = bearer_header(role="owner", user_id=owner_id)
    business_id = (await client.post(
        "/v1/businesses", json={"legal_name": "Yaw's Tomatoes", "entity_type": "sole_prop"}, headers=creator,
    )).json()["id"]
    owner = bearer_header(role="owner", user_id=owner_id, business_id=uuid.UUID(business_id))
    created = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={"filename": filename, "mime": "application/octet-stream", "size_bytes": 10,
              "sha256": hashlib.sha256(sha_seed).hexdigest()},
        headers=owner,
    )
    return owner, business_id, created.json()["document_id"]


async def _stage(db_ready, document_id, reading):
    session_factory = async_sessionmaker(db_ready, expire_on_commit=False)
    async with session_factory() as session:
        doc = await session.get(Document, uuid.UUID(document_id))
        auto = await session.run_sync(lambda sync: stage_reading(sync, doc, reading))
        await session.commit()
        return auto


async def _transactions(db_ready, business_id):
    session_factory = async_sessionmaker(db_ready, expire_on_commit=False)
    async with session_factory() as session:
        return list(await session.scalars(
            select(Transaction).where(Transaction.business_id == uuid.UUID(business_id)).order_by(Transaction.occurred_on)
        ))


async def test_reconciled_statement_is_confirmed_automatically_and_deduped(client, db_ready, monkeypatch):
    from app.workers.tasks import recompute

    monkeypatch.setattr(recompute, "delay", lambda *_: None)
    owner, business_id, document_id = await _document(client, b"auto-confirm")
    rows = [_row("100.00", "in", "100.00", "R1"), _row("40.00", "out", "60.00", "R2", "2026-03-05")]
    assert await _stage(db_ready, document_id, _reading(rows)) is True

    transactions = await _transactions(db_ready, business_id)
    assert [t.amount_pesewas for t in transactions] == [10000, 4000]
    assert transactions[0].flags["counterparty"] == "AMA •••456"
    assert transactions[0].provenance["extraction_ids"]

    # An overlapping second statement repeats R2 and adds one new row.
    created = await client.post(
        f"/v1/businesses/{business_id}/documents",
        json={"filename": "momo-2.pdf", "mime": "application/pdf", "size_bytes": 10,
              "sha256": hashlib.sha256(b"overlap").hexdigest()},
        headers=owner,
    )
    overlap = [_row("40.00", "out", "60.00", "R2", "2026-03-05"), _row("15.00", "in", "75.00", "R3", "2026-03-06")]
    await _stage(db_ready, created.json()["document_id"], _reading(overlap))
    assert len(await _transactions(db_ready, business_id)) == 3


async def test_unreconciled_rows_wait_for_owner_review(client, db_ready, monkeypatch):
    from app.workers.tasks import recompute

    monkeypatch.setattr(recompute, "delay", lambda *_: None)
    owner, business_id, document_id = await _document(client, b"needs-review")
    rows = [_row("100.00", "in", "100.00", "A1"), _row("40.00", "out", "90.00", "A2"), _row("5.00", "in", None, "A3")]
    assert await _stage(db_ready, document_id, _reading(rows)) is False
    assert await _transactions(db_ready, business_id) == []

    listed = await client.get(f"/v1/documents/{document_id}/extracted-rows", headers=owner)
    assert listed.status_code == 200
    body = listed.json()
    assert body["state"] == "needs_review"
    assert body["reconciliation"]["status"] == "balance_breaks"
    first, second, third = (row["id"] for row in body["rows"])

    confirmed = await client.post(
        f"/v1/documents/{document_id}/extracted-rows/confirm",
        json={"rows": [{"id": second, "amount_pesewas": 1000}, {"id": third, "include": False}]},
        headers=owner,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["transactions_created"] == 2

    transactions = await _transactions(db_ready, business_id)
    assert sorted(t.amount_pesewas for t in transactions) == [1000, 10000]
    assert all(t.flags.get("owner_confirmed") for t in transactions)

    again = await client.post(f"/v1/documents/{document_id}/extracted-rows/confirm", json={"rows": []}, headers=owner)
    assert again.status_code == 409

    reread = (await client.get(f"/v1/documents/{document_id}/extracted-rows", headers=owner)).json()
    assert reread["state"] == "confirmed"
    assert [row["excluded"] for row in reread["rows"]] == [False, False, True]
    assert reread["rows"][1]["corrected"] is True


async def test_worker_reads_pasted_sms_with_the_ai_reader(client, db_ready, monkeypatch):
    from types import SimpleNamespace

    import app.services.document_reader as reader_module
    import app.services.storage as storage_module
    from app.workers.tasks import recompute, s1_ingest

    monkeypatch.setattr(recompute, "delay", lambda *_: None)
    owner, business_id, document_id = await _document(client, b"sms-paste", "pasted-sms.txt")
    sms = b"Payment received for GHS 100.00 from AMA. Current Balance: GHS 100.00. Transaction Id: S1."
    monkeypatch.setattr(storage_module, "get_storage_backend", lambda: SimpleNamespace(read_bytes=lambda key: sms))
    seen: list[str] = []

    class FakeReader:
        def read(self, payload, filename, processed):
            seen.append(processed.text)
            return _reading([_row("100.00", "in", "100.00", "S1")])

    monkeypatch.setattr(reader_module, "get_document_reader", lambda: FakeReader())

    result = s1_ingest.run(document_id)

    assert result["reader"] == "claude"
    assert "Payment received" in seen[0]
    rows = (await client.get(f"/v1/documents/{document_id}/extracted-rows", headers=owner)).json()
    # A single balance can't be checked against anything, so the owner reviews it.
    assert rows["state"] == "needs_review"
    assert len(rows["rows"]) == 1


async def test_same_value_rows_with_different_references_are_kept(client, db_ready, monkeypatch):
    from dataclasses import replace

    from app.workers.tasks import recompute

    monkeypatch.setattr(recompute, "delay", lambda *_: None)
    _, business_id, document_id = await _document(client, b"same-value")
    rows = [
        _row("100.00", "in", "100.00", "A1"), _row("100.00", "out", "0.00", "A2"),
        _row("100.00", "in", "100.00", "A3"), _row("40.00", "out", "60.00", "A4"),
    ]
    reading = replace(_reading(rows), summary="Statement for 0244123456.", findings=("Account 1234567890 is listed.",),
                      account_label="0244123456")
    assert await _stage(db_ready, document_id, reading) is True

    transactions = await _transactions(db_ready, business_id)
    assert sorted(t.provider_reference for t in transactions) == ["A1", "A2", "A3", "A4"]
    session_factory = async_sessionmaker(db_ready, expire_on_commit=False)
    async with session_factory() as session:
        meta = (await session.get(Document, uuid.UUID(document_id))).quality_flags["ai_ingest"]
    assert meta["summary"] == "Statement for •••456."
    assert meta["findings"] == ["Account •••890 is listed."]
    assert meta["account_label"] == "•••3456"
