"""Acceptance coverage through the authenticated API against isolated Postgres."""
import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings, get_settings
from app.models import Account, AuditEvent, Document, Extraction, Transaction
from app.models.access import BusinessAccess
from app.models.agriculture import Enterprise, FarmEntry
from app.models.enums import AccountKind, CategorySource, Direction, DocStatus, Provider
from tests.conftest import bearer_header


async def business(client, name="Family Farm"):
    uid = uuid.uuid4()
    headers = bearer_header(role="owner", user_id=uid)
    response = await client.post("/v1/businesses", json={"legal_name": name, "entity_type": "sole_prop"}, headers=headers)
    assert response.status_code == 201, response.text
    return uid, headers, response.json()["id"]


async def enterprise(client, headers, bid, type="crop", subtype="maize"):
    response = await client.post(f"/v1/businesses/{bid}/farm/enterprises", headers=headers,
                                 json={"name": f"{subtype} unit", "type": type, "subtype": subtype})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def entry(eid=None, **changes):
    return {"enterprise_id": eid, "shared_overhead": eid is None, "kind": "expense",
            "occurred_on": "2026-06-01", "amount_pesewas": 101,
            "category": "Seeds" if eid else "General overhead", "description": "Illustrative activity", **changes}


async def post_entry(client, headers, bid, body):
    response = await client.post(f"/v1/businesses/{bid}/farm/entries", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_edit_delete_and_report_arithmetic_stay_consistent(client, db_ready):
    _, headers, bid = await business(client)
    eid = await enterprise(client, headers, bid)
    cost = await post_entry(client, headers, bid, entry(eid))
    sale = await post_entry(client, headers, bid, entry(eid, kind="income", category="Produce sales", amount_pesewas=305))
    report = (await client.get(f"/v1/businesses/{bid}/farm/report", headers=headers)).json()
    assert report["totals"]["surplus_pesewas"] == 204
    assert report["sources"]["declared"]["count"] == 2
    assert report["sources"]["extracted"]["count"] == 0
    assert report["totals"]["without_evidence"] == 2
    assert report["independent_verification"] is False
    changed = await client.put(f"/v1/businesses/{bid}/farm/entries/{cost['id']}", json=entry(eid, amount_pesewas=102), headers=headers)
    assert changed.status_code == 200
    summary = (await client.get(f"/v1/businesses/{bid}/farm/summary", headers=headers)).json()
    assert summary["totals"]["surplus_pesewas"] == 203
    assert summary["record_version"] != report["record_version"]
    assert "entries" not in summary
    assert (await client.delete(f"/v1/businesses/{bid}/farm/entries/{sale['id']}", headers=headers)).status_code == 204
    report = (await client.get(f"/v1/businesses/{bid}/farm/report", headers=headers)).json()
    assert report["totals"]["surplus_pesewas"] == -102
    assert len(report["entries"]) == 1
    assert (await client.get(f"/v1/businesses/{bid}/indicators", headers=headers)).json() == []
    async with async_sessionmaker(db_ready)() as session:
        assert await session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "farm.entry.update")) == 1


async def test_owners_cannot_read_write_select_or_link_other_tenant(client):
    _, a, aid = await business(client, "Farm A")
    _, b, bid = await business(client, "Farm B")
    aeid = await enterprise(client, a, aid)
    beid = await enterprise(client, b, bid)
    row = await post_entry(client, b, bid, entry(beid))
    for route in ("farm/report", "farm/summary", "farm/entries", "farm/enterprises", "farm/cycles"):
        assert (await client.get(f"/v1/businesses/{bid}/{route}", headers=a)).status_code == 403
    assert (await client.post(f"/v1/businesses/{bid}/select", headers=a)).status_code == 403
    assert (await client.put(f"/v1/businesses/{bid}/farm/entries/{row['id']}", headers=a, json=entry(beid))).status_code == 403
    assert (await client.delete(f"/v1/businesses/{aid}/farm/entries/{row['id']}", headers=a)).status_code == 404
    assert (await client.post(f"/v1/businesses/{aid}/farm/entries", headers=a, json=entry(beid))).status_code == 404
    assert (await client.get(f"/v1/businesses/{aid}/farm/report?enterprise_id={beid}", headers=a)).status_code == 404
    assert (await client.post(f"/v1/businesses/{aid}/farm/entries", headers=a, json=entry(aeid, evidence_document_id=str(uuid.uuid4())))).status_code == 404
    assert (await client.get("/v1/businesses", headers=a)).json()["total"] == 1
    reviewer = bearer_header(role="reviewer", user_id=uuid.uuid4())
    assert (await client.get(f"/v1/businesses/{aid}/farm/report", headers=reviewer)).status_code == 403


async def test_cycles_and_poultry_categories_are_enterprise_specific(client):
    _, headers, bid = await business(client)
    crop = await enterprise(client, headers, bid)
    poultry = await enterprise(client, headers, bid, "livestock", "layers")
    body = {"enterprise_id": poultry, "name": "Layer flock", "start_date": "2026-03-01", "metadata_json": {"batch_size": 120}}
    cycle = await client.post(f"/v1/businesses/{bid}/farm/cycles", headers=headers, json=body)
    assert cycle.status_code == 201
    cid = cycle.json()["id"]
    assert (await client.post(f"/v1/businesses/{bid}/farm/entries", headers=headers, json=entry(crop, cycle_id=cid))).status_code == 404
    assert (await client.post(f"/v1/businesses/{bid}/farm/entries", headers=headers, json=entry(poultry))).status_code == 422
    await post_entry(client, headers, bid, entry(poultry, category="Feed", cycle_id=cid, amount_pesewas=45000))
    report = (await client.get(f"/v1/businesses/{bid}/farm/report?cycle_id={cid}", headers=headers)).json()
    assert report["totals"]["expenditures_pesewas"] == 45000
    assert any("not marked complete" in warning for warning in report["warnings"])
    invalid = {**body, "end_date": "2026-02-01"}
    assert (await client.post(f"/v1/businesses/{bid}/farm/cycles", headers=headers, json=invalid)).status_code == 422


@pytest.mark.parametrize("amount", [0, -1, 1.5, "100", True, 1_000_000_000_001])
async def test_invalid_money_is_rejected(client, amount):
    _, headers, bid = await business(client)
    eid = await enterprise(client, headers, bid)
    response = await client.post(f"/v1/businesses/{bid}/farm/entries", headers=headers, json=entry(eid, amount_pesewas=amount))
    assert response.status_code == 422


async def test_demo_idempotency_rollups_all_profiles_and_environment_gate(client):
    from app.api.main import app
    _, headers, _ = await business(client)
    assert (await client.post("/v1/agriculture/demo", headers=headers)).status_code == 404
    app.dependency_overrides[get_settings] = lambda: Settings(environment="production", demo_mode_enabled=True)
    assert (await client.post("/v1/agriculture/demo", headers=headers)).status_code == 404
    app.dependency_overrides[get_settings] = lambda: Settings(environment="test", demo_mode_enabled=True)
    result = await client.post("/v1/agriculture/demo", headers=headers)
    assert result.status_code == 200, result.text
    samples = result.json()["items"]
    assert len(samples) == 5 and all(sample["is_demo"] for sample in samples)
    second = (await client.post("/v1/agriculture/demo", headers=headers)).json()
    assert [row["id"] for row in second["items"]] == [row["id"] for row in samples]
    expected = [(2420000, 1045000, 1375000), (1800000, 627000, 1173000), (725000, 448000, 277000), (1080000, 665000, 415000), (840000, 225000, 615000)]
    for sample, (receipts, costs, surplus) in zip(samples, expected, strict=True):
        report = (await client.get(f"/v1/businesses/{sample['id']}/farm/report", headers=headers)).json()
        assert report["totals"]["receipts_pesewas"] == receipts
        assert report["totals"]["expenditures_pesewas"] == costs
        assert report["totals"]["surplus_pesewas"] == surplus
        assert report["totals"]["without_evidence"] == report["totals"]["count"]
        assert sum(row["surplus_pesewas"] for row in report["enterprises"]) == surplus
    mixed = samples[1]["id"]
    report = (await client.get(f"/v1/businesses/{mixed}/farm/report", headers=headers)).json()
    overhead = next(row for row in report["enterprises"] if row["key"] == "shared_overhead")
    assert overhead["expenditures_pesewas"] == 45000
    for group in report["enterprises"]:
        if group["key"] == "shared_overhead":
            continue
        filtered = (await client.get(f"/v1/businesses/{mixed}/farm/report?enterprise_id={group['key']}", headers=headers)).json()
        assert filtered["totals"]["surplus_pesewas"] == group["surplus_pesewas"]
    _, other_headers, _ = await business(client)
    assert (await client.get(f"/v1/businesses/{mixed}/farm/report", headers=other_headers)).status_code == 403


async def test_source_allocations_keep_amounts_provenance_and_tenant_boundaries(client, db_ready, monkeypatch):
    uid, headers, bid = await business(client)
    _, other_headers, other_bid = await business(client)
    eid = await enterprise(client, headers, bid)
    async with async_sessionmaker(db_ready, expire_on_commit=False)() as session:
        account = Account(business_id=uuid.UUID(bid), kind=AccountKind.BANK, provider=Provider.GCB, identifier_hash="fictional", display_suffix="0000")
        document = Document(business_id=uuid.UUID(bid), uploaded_by=uid, storage_key="demo/statement.pdf", sha256="0"*64, mime="application/pdf", status=DocStatus.EXTRACTED)
        session.add_all([account, document]); await session.flush()
        extraction = Extraction(document_id=document.id, page=1, field_path="transactions[0]", value_json={"amount_pesewas": 9001}, extractor="fixture")
        session.add(extraction); await session.flush()
        transaction = Transaction(business_id=uuid.UUID(bid), account_id=account.id, document_id=document.id, occurred_on=date(2026, 6, 1), direction=Direction.IN,
                                  amount_pesewas=9001, fee_pesewas=2, levy_pesewas=1, category_l1="revenue", provenance={"extraction_ids": [str(extraction.id)]})
        session.add(transaction); await session.commit()
        tid, did = str(transaction.id), str(document.id)
    for method in ("get", "patch"):
        kwargs = {"json": {"category_l1": "opex"}} if method == "patch" else {}
        response = await getattr(client, method)(f"/v1/transactions/{tid}", headers=other_headers, **kwargs)
        assert response.status_code == 403
    assert (await client.post(f"/v1/businesses/{other_bid}/farm/entries", headers=other_headers, json=entry(None, source_transaction_id=tid, amount_pesewas=None))).status_code == 404
    body = entry(eid, kind="income", category="Produce sales", amount_pesewas=None, source_transaction_id=tid)
    row = await post_entry(client, headers, bid, body)
    assert row["amount_pesewas"] == 9001 and row["value_kind"] == "extracted" and row["evidence_status"] == "attached"
    assert (await client.post(f"/v1/businesses/{bid}/farm/entries", headers=headers, json=body)).status_code == 409
    report = (await client.get(f"/v1/businesses/{bid}/farm/report", headers=headers)).json()
    assert report["totals"]["surplus_pesewas"] == 8998
    assert report["sources"]["extracted"]["receipts_pesewas"] == 9001
    from app.workers.tasks import recompute
    monkeypatch.setattr(recompute, "delay", lambda *args: SimpleNamespace(id="unused"))
    assert (await client.delete(f"/v1/documents/{did}", headers=headers)).status_code == 204
    report = (await client.get(f"/v1/businesses/{bid}/farm/report", headers=headers)).json()
    assert report["totals"]["count"] == 0


async def test_task_results_are_business_scoped(client, monkeypatch):
    _, headers, bid = await business(client)
    _, other, _ = await business(client)
    from app.workers.tasks import recompute
    monkeypatch.setattr(recompute, "delay", lambda *args: SimpleNamespace(id="test-owned-task"))
    response = await client.post(f"/v1/businesses/{bid}/recompute", headers=headers)
    assert response.status_code == 202
    assert (await client.get("/v1/tasks/test-owned-task", headers=other)).status_code == 403
    assert (await client.get("/v1/tasks/unknown-task", headers=headers)).status_code == 404


async def test_evidence_requires_completed_bytes_and_disappears_on_document_delete(client, monkeypatch):
    import hashlib
    from app.api.main import app
    from app.services.storage import get_storage_backend
    from app.workers.tasks import s1_ingest
    _, headers, bid = await business(client)
    eid = await enterprise(client, headers, bid)
    content = b"Fictional supporting receipt"
    created = await client.post(f"/v1/businesses/{bid}/documents", headers=headers, json={
        "filename": "fictional-receipt.pdf", "mime": "application/pdf", "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    })
    did = created.json()["document_id"]
    body = entry(eid, evidence_document_id=did)
    assert (await client.post(f"/v1/businesses/{bid}/farm/entries", headers=headers, json=body)).status_code == 422
    storage = SimpleNamespace(payload=b"Different bytes")
    storage.read_bytes = lambda key: storage.payload
    app.dependency_overrides[get_storage_backend] = lambda: storage
    monkeypatch.setattr(s1_ingest, "delay", lambda *args: None)
    wrong = await client.post(f"/v1/documents/{did}/complete", headers=headers)
    assert wrong.status_code == 422 and wrong.json()["error"]["code"] == "UPLOAD_HASH_MISMATCH"
    storage.payload = content
    assert (await client.post(f"/v1/documents/{did}/complete", headers=headers)).status_code == 202
    row = await post_entry(client, headers, bid, body)
    assert row["evidence_status"] == "attached" and row["value_kind"] == "declared"
    assert (await client.delete(f"/v1/documents/{did}", headers=headers)).status_code == 204
    report = (await client.get(f"/v1/businesses/{bid}/farm/report", headers=headers)).json()
    assert report["totals"]["expenditures_pesewas"] == 101
    assert report["totals"]["without_evidence"] == 1


async def test_account_deletion_removes_farm_records(client, db_ready):
    uid, headers, bid = await business(client)
    eid = await enterprise(client, headers, bid)
    await post_entry(client, headers, bid, entry(eid))
    await post_entry(client, headers, bid, entry())
    owner = bearer_header(role="owner", user_id=uid, business_id=uuid.UUID(bid))
    assert (await client.delete(f"/v1/businesses/{bid}", headers=owner)).status_code == 204
    async with async_sessionmaker(db_ready)() as session:
        for model in (FarmEntry, Enterprise, BusinessAccess):
            assert await session.scalar(select(func.count()).select_from(model).where(model.business_id == uuid.UUID(bid))) == 0
