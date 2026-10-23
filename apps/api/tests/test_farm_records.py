"""Farm sales and costs live in the main ledger, tagged by crop/animal and season."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings, get_settings
from app.models import Document, Transaction
from tests.conftest import bearer_header
from tests.test_ona_tools import _seed


async def _owner(client, name="Yaw Mensah Farms"):
    uid = uuid.uuid4()
    created = await client.post("/v1/businesses", json={"legal_name": name, "entity_type": "sole_prop"},
                                headers=bearer_header(role="owner", user_id=uid))
    assert created.status_code == 201, created.text
    bid = created.json()["id"]
    return bearer_header(role="owner", user_id=uid, business_id=uuid.UUID(bid)), bid


def _record(**changes):
    return {"direction": "out", "occurred_on": "2026-05-09", "amount_pesewas": 135000, "category": "Seeds and seedlings",
            "description": "Tomato seedlings", "farm_activity": "Tomatoes ", "season": "2026  main season", **changes}


async def test_typed_records_flow_into_money_and_the_crop_breakdown(client):
    headers, bid = await _owner(client)
    assert (await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json=_record())).status_code == 201
    sale = await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json=_record(
        direction="in", occurred_on="2026-07-18", amount_pesewas=720000, category="Produce sales",
        description="First harvest", counterparty="Makola market queen"))
    assert sale.status_code == 201, sale.text
    await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json=_record(
        occurred_on="2026-06-01", amount_pesewas=10000, category="Transport", farm_activity=None, season=None))

    summary = (await client.get(f"/v1/businesses/{bid}/money/summary", headers=headers)).json()
    assert summary["cash_flow"]["totals"]["money_in"] == "GH¢7,200.00"
    assert summary["cash_flow"]["totals"]["money_out"] == "GH¢1,450.00"
    [group] = summary["farm"]["groups"]
    assert (group["farm_activity"], group["season"]) == ("Tomatoes", "2026 main season")
    assert group["left_over_pesewas"] == 720000 - 135000
    assert group["typed_in_by_owner"] == 2
    assert summary["farm"]["untagged"]["money_out_pesewas"] == 10000
    assert summary["farm_tags"] == {"activities": ["Tomatoes"], "seasons": ["2026 main season"]}
    assert summary["example_season_available"] is False

    only_tomatoes = (await client.get(f"/v1/businesses/{bid}/money/summary?farm_activity=Tomatoes", headers=headers)).json()
    assert only_tomatoes["cash_flow"]["totals"]["money_out"] == "GH¢1,350.00"
    listed = (await client.get(f"/v1/businesses/{bid}/money/transactions?season=2026 main season", headers=headers)).json()
    assert listed["matches"] == 2
    assert all(item["hand_entered"] and item["document_name"] == "Records you typed in" for item in listed["items"])
    assert {item["category_l1"] for item in listed["items"]} == {"revenue", "cogs"}

    documents = (await client.get(f"/v1/businesses/{bid}/documents", headers=headers)).json()["items"]
    assert [(d["filename"], d["doc_type"], d["transaction_count"]) for d in documents] == [("Records you typed in", "informal_ledger", 3)]


async def test_tags_can_be_set_on_any_transaction_and_typed_records_removed(client, db_ready, monkeypatch):
    business_id, sessions = await _seed(client, db_ready, monkeypatch)
    async with sessions() as session:
        statement_row = await session.scalar(select(Transaction).where(Transaction.business_id == business_id).limit(1))
        uploader = (await session.get(Document, statement_row.document_id)).uploaded_by
    headers = bearer_header(role="owner", user_id=uploader, business_id=business_id)
    tagged = await client.patch(f"/v1/transactions/{statement_row.id}", headers=headers,
                                json={"farm_activity": "  Maize", "season": "2026 minor season"})
    assert tagged.status_code == 200, tagged.text
    assert (tagged.json()["farm_activity"], tagged.json()["season"]) == ("Maize", "2026 minor season")
    assert (await client.delete(f"/v1/transactions/{statement_row.id}", headers=headers)).status_code == 409
    cleared = await client.patch(f"/v1/transactions/{statement_row.id}", headers=headers, json={"farm_activity": ""})
    assert cleared.json()["farm_activity"] is None and cleared.json()["season"] == "2026 minor season"

    typed = (await client.post(f"/v1/businesses/{business_id}/money/records", headers=headers, json=_record())).json()
    assert (await client.delete(f"/v1/transactions/{typed['id']}", headers=headers)).status_code == 204
    async with sessions() as session:
        assert await session.get(Transaction, uuid.UUID(typed["id"])) is None


async def test_records_are_validated_and_scoped_to_the_owner(client):
    headers, bid = await _owner(client)
    other, _ = await _owner(client, "Someone else")
    url = f"/v1/businesses/{bid}/money/records"
    assert (await client.post(url, headers=other, json=_record())).status_code == 403
    assert (await client.post(url, headers=headers, json=_record(category="Produce sales"))).status_code == 422
    assert (await client.post(url, headers=headers, json=_record(amount_pesewas=0))).status_code == 422
    assert (await client.post(url, headers=headers, json=_record(occurred_on="2999-01-01"))).status_code == 422
    typed = (await client.post(url, headers=headers, json=_record())).json()
    assert (await client.delete(f"/v1/transactions/{typed['id']}", headers=other)).status_code == 403
    categories = (await client.get("/v1/money/record-categories", headers=headers)).json()
    assert "Produce sales" in categories["in"] and "Seeds and seedlings" in categories["out"]


async def test_example_season_loads_yaws_tomatoes_into_the_signed_in_business(client):
    from app.api.main import app
    headers, bid = await _owner(client)
    url = f"/v1/businesses/{bid}/money/example-season"
    assert (await client.post(url, headers=headers)).status_code == 404
    app.dependency_overrides[get_settings] = lambda: Settings(demo_mode_enabled=True)
    try:
        assert (await client.get(f"/v1/businesses/{bid}/money/summary", headers=headers)).json()["example_season_available"]
        assert (await client.post(url, headers=headers)).json() == {"added": 8}
        assert (await client.post(url, headers=headers)).status_code == 409
    finally:
        app.dependency_overrides.pop(get_settings, None)
    summary = (await client.get(f"/v1/businesses/{bid}/money/summary", headers=headers)).json()
    [group] = summary["farm"]["groups"]
    assert group["farm_activity"] == "Tomatoes"
    assert group["money_in"] == "GH¢24,200.00" and group["money_out"] == "GH¢10,450.00"
    me = (await client.get("/v1/businesses", headers=headers)).json()
    assert me["total"] == 1, "no second business is created"


async def test_deleting_the_business_removes_typed_records(client, db_ready):
    headers, bid = await _owner(client)
    await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json=_record())
    assert (await client.delete(f"/v1/businesses/{bid}", headers=headers)).status_code == 204
    async with async_sessionmaker(db_ready)() as session:
        assert await session.scalar(select(Transaction).where(Transaction.business_id == uuid.UUID(bid))) is None


async def test_typed_records_are_analysed_but_never_count_as_statement_months(client):
    headers, bid = await _owner(client)
    for day in ("2026-03-02", "2026-06-02", "2026-09-02"):
        await client.post(f"/v1/businesses/{bid}/money/records", headers=headers, json=_record(occurred_on=day))
    coverage = (await client.get(f"/v1/businesses/{bid}/coverage", headers=headers)).json()
    assert coverage["continuous_months"] == 0
    assert coverage["analysis_window"] == {"from": "2025-10-01", "to": "2026-09-02"}
