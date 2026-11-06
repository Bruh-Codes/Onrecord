"""Connected Paystack: connect with a secret key, sync payments into the ledger, stay read-only.

Paystack is replaced by an in-memory fake behind httpx.MockTransport; the sync
runs the real worker code in-process.
"""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, Document, PaystackConnection, Transaction
from app.services.paystack import client as paystack_client
from app.services.paystack import secrets
from tests.conftest import bearer_header

KEY = "sk_test_" + "a1" * 20
NEW_KEY = "sk_test_" + "b2" * 20
NOW = datetime.now(UTC)


def _at(days_ago: int, hour: int = 10) -> str:
    return (NOW - timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


class FakePaystack:
    def __init__(self):
        self.valid_keys = {KEY}
        self.transactions: list[dict] = []
        self.refunds: list[dict] = []
        self.settlements: list[dict] = []
        self.methods: set[str] = set()

    def payment(self, id_, days_ago, amount, fees, *, name=None, status="success", currency="GHS", hour=10):
        customer = {"email": f"c{id_}@example.com"}
        if name:
            first, last = name.split(" ")
            customer |= {"first_name": first, "last_name": last}
        self.transactions.append({
            "id": id_, "reference": f"ref-{id_}", "amount": amount, "fees": fees, "currency": currency,
            "status": status, "channel": "mobile_money", "paid_at": _at(days_ago, hour), "customer": customer,
        })

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.methods.add(request.method)
        if request.headers.get("Authorization", "").removeprefix("Bearer ") not in self.valid_keys:
            return httpx.Response(401, json={"status": False, "message": "Invalid key"})
        data = {"/transaction": self.transactions, "/refund": self.refunds, "/settlement": self.settlements}[request.url.path]
        per_page, page = int(request.url.params["perPage"]), int(request.url.params.get("page", 1))
        chunk = data[(page - 1) * per_page: page * per_page]
        page_count = max(1, -(-len(data) // per_page))
        return httpx.Response(200, json={"status": True, "data": chunk, "meta": {"total": len(data), "page": page, "pageCount": page_count}})


@pytest.fixture
def paystack(monkeypatch):
    fake = FakePaystack()
    monkeypatch.setattr(get_settings(), "paystack_key_secret", "test-secret-for-paystack-keys")
    original = paystack_client.PaystackClient.__init__

    def init(self, secret_key, *, transport=None):
        original(self, secret_key, transport=httpx.MockTransport(fake.handler))

    monkeypatch.setattr(paystack_client.PaystackClient, "__init__", init)
    return fake


@pytest.fixture
def run_worker(db_ready, monkeypatch):
    from app.db import engine_sync
    from app.workers import paystack_tasks, tasks

    engine_sync.dispose()
    monkeypatch.setattr(tasks.recompute, "delay", lambda *args: SimpleNamespace(id="x"))
    monkeypatch.setattr(paystack_tasks, "recompute_business", lambda session, business_id: None)

    def run(connection_id):
        with Session(engine_sync) as session:
            return paystack_tasks.run_sync(session, uuid.UUID(str(connection_id)))

    monkeypatch.setattr(paystack_tasks.sync_paystack, "delay", run)
    return run


async def _owner(client):
    uid = uuid.uuid4()
    created = await client.post("/v1/businesses", json={"legal_name": "Ama Provisions", "entity_type": "sole_prop"},
                                headers=bearer_header(role="owner", user_id=uid))
    assert created.status_code == 201, created.text
    bid = created.json()["id"]
    return bearer_header(role="owner", user_id=uid, business_id=uuid.UUID(bid)), bid


def _ledger(business_id) -> list[tuple]:
    from app.db import engine_sync

    with Session(engine_sync) as session:
        rows = session.scalars(select(Transaction).where(Transaction.business_id == uuid.UUID(business_id))).all()
        return sorted(
            (t.provider_reference, t.direction.value, t.amount_pesewas, t.description, t.category_l1, bool((t.flags or {}).get("internal_transfer")))
            for t in rows
        )


async def test_connect_reads_payments_fees_refunds_and_payouts(client, paystack, run_worker):
    headers, bid = await _owner(client)
    paystack.payment(1, 3, 10000, 195, name="Ama Mensah")
    paystack.payment(2, 3, 5000, 98, hour=14)
    paystack.payment(3, 2, 7000, 137, status="failed")
    paystack.payment(4, 2, 9000, 100, currency="NGN")
    paystack.refunds.append({"id": 77, "amount": 2000, "currency": "GHS", "status": "processed", "refunded_at": _at(1), "transaction": {"id": 1}})
    paystack.settlements.append({"id": 900, "total_amount": 15000, "effective_amount": 14707, "total_fees": 293,
                                 "currency": "GHS", "status": "success", "settlement_date": _at(1)})

    connected = await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": f"  {KEY} "})
    assert connected.status_code == 200, connected.text
    body = connected.json()
    assert (body["status"], body["mode"], body["key_last4"], body["payments"]) == ("active", "test", KEY[-4:], 2)
    assert KEY not in connected.text
    assert body["last_result"]["other_currency"] == 1

    day = (NOW - timedelta(days=3)).date().isoformat()
    assert _ledger(bid) == sorted([
        ("txn:1", "in", 10000, "Paystack payment from Ama Mensah", "revenue", False),
        ("txn:2", "in", 5000, "Paystack payment", "revenue", False),
        (f"fees:{day}", "out", 293, "Paystack fees", "opex", False),
        ("refund:77", "out", 2000, "Paystack refund to a customer", "opex", False),
        ("payout:900", "out", 14707, "Paystack payout to your bank", "internal", True),
    ])
    assert paystack.methods == {"GET"}

    from app.db import engine_sync
    with Session(engine_sync) as session:
        connection = session.scalar(select(PaystackConnection).where(PaystackConnection.business_id == uuid.UUID(bid)))
        assert connection.key_ciphertext and KEY not in connection.key_ciphertext
        assert secrets.decrypt(connection.key_ciphertext) == KEY
        document = session.get(Document, connection.document_id)
        assert document.doc_type.value == "processor_statement" and document.issuer.value == "PAYSTACK"
        assert document.period_start == (NOW - timedelta(days=3)).date()
        account = session.get(Account, connection.account_id)
        assert (account.kind.value, account.provider.value) == ("pos", "PAYSTACK")


async def test_sync_adds_only_new_payments_and_updates_the_days_fees(client, paystack, run_worker):
    headers, bid = await _owner(client)
    paystack.payment(1, 0, 10000, 195)
    await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": KEY})
    connection_id = (await client.get(f"/v1/businesses/{bid}/paystack", headers=headers)).json()["id"]

    assert run_worker(connection_id)["changed"] is False
    paystack.payment(2, 0, 4000, 78)
    result = run_worker(connection_id)
    assert (result["payments"], result["changed"]) == (1, True)
    fees = [row for row in _ledger(bid) if row[0].startswith("fees:")]
    assert [row[2] for row in fees] == [273]

    queued = await client.post(f"/v1/businesses/{bid}/paystack/sync", headers=headers)
    assert queued.status_code == 202
    assert len(_ledger(bid)) == 3


async def test_bad_keys_are_refused_with_a_clear_reason(client, paystack, run_worker):
    headers, bid = await _owner(client)
    public = await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": "pk_test_" + "a" * 40})
    assert public.status_code == 422 and public.json()["error"]["code"] == "PAYSTACK_PUBLIC_KEY"
    rejected = await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": "sk_live_" + "c3" * 20})
    assert rejected.status_code == 422 and rejected.json()["error"]["code"] == "PAYSTACK_KEY_REJECTED"
    assert (await client.get(f"/v1/businesses/{bid}/paystack", headers=headers)).json() is None


async def test_a_changed_key_asks_for_the_new_one_and_disconnect_forgets_it(client, paystack, run_worker):
    headers, bid = await _owner(client)
    paystack.payment(1, 1, 10000, 195)
    await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": KEY})
    connection_id = (await client.get(f"/v1/businesses/{bid}/paystack", headers=headers)).json()["id"]

    paystack.valid_keys = {NEW_KEY}
    assert run_worker(connection_id) == {"error": "PAYSTACK_KEY_REJECTED"}
    current = (await client.get(f"/v1/businesses/{bid}/paystack", headers=headers)).json()
    assert current["status"] == "needs_attention" and "secret key" in current["last_error"]

    replaced = await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": NEW_KEY})
    assert (replaced.json()["id"], replaced.json()["status"], replaced.json()["key_last4"]) == (connection_id, "active", NEW_KEY[-4:])

    assert (await client.delete(f"/v1/businesses/{bid}/paystack", headers=headers)).status_code == 204
    assert (await client.get(f"/v1/businesses/{bid}/paystack", headers=headers)).json() is None
    from app.db import engine_sync
    with Session(engine_sync) as session:
        assert session.get(PaystackConnection, uuid.UUID(connection_id)).key_ciphertext is None
    assert len(_ledger(bid)) == 2  # records stay after disconnecting

    # Reconnecting picks up the same ledger: nothing is added twice.
    again = await client.put(f"/v1/businesses/{bid}/paystack", headers=headers, json={"secret_key": NEW_KEY})
    assert again.json()["id"] != connection_id and again.json()["payments"] == 1
    assert len(_ledger(bid)) == 2


async def test_reviewers_cannot_connect(client, paystack, run_worker):
    _, bid = await _owner(client)
    reviewer = bearer_header(role="reviewer", user_id=uuid.uuid4(), business_id=uuid.UUID(bid))
    response = await client.put(f"/v1/businesses/{bid}/paystack", headers=reviewer, json={"secret_key": KEY})
    assert response.status_code == 403


def test_key_format_and_encryption(monkeypatch):
    monkeypatch.setattr(get_settings(), "paystack_key_secret", "")
    with pytest.raises(secrets.PaystackKeyError) as missing:
        secrets.encrypt(KEY)
    assert missing.value.code == "PAYSTACK_NOT_CONFIGURED"
    monkeypatch.setattr(get_settings(), "paystack_key_secret", "one")
    assert secrets.check_format(KEY) == "test"
    assert secrets.check_format("sk_live_" + "x" * 30) == "live"
    stored = secrets.encrypt(KEY)
    assert secrets.decrypt(stored) == KEY
    monkeypatch.setattr(get_settings(), "paystack_key_secret", "two")
    with pytest.raises(secrets.PaystackKeyError) as unreadable:
        secrets.decrypt(stored)
    assert unreadable.value.code == "PAYSTACK_KEY_UNREADABLE"
