"""Run against a separate, EMPTY database; never the API/test fixture database."""
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


def test_farm_migrations_preserve_legacy_records(monkeypatch):
    url = os.environ.get("MIGRATION_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set MIGRATION_TEST_DATABASE_URL to a separate empty database ending in _test.")
    parsed = make_url(url)
    if not (parsed.database or "").endswith("_test"):
        pytest.fail("Migration test database must end in _test.")
    if parsed.database == make_url(os.environ.get("TEST_DATABASE_URL", "postgresql:///unused")).database:
        pytest.fail("Migration and API fixture databases must differ.")
    engine = create_engine(url)
    if inspect(engine).has_table("business"):
        pytest.fail("Migration test database must be empty; existing data will not be cleared.")
    from app.config import get_settings
    settings = get_settings().model_copy(update={"database_url_sync": url})
    monkeypatch.setattr("app.config.get_settings", lambda: settings)
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    command.upgrade(config, "a2b4c6d8e0f1")
    bid, uid, audit = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with engine.begin() as connection:
        connection.execute(text('INSERT INTO business (id, legal_name, entity_type) VALUES (:id, :name, :type)'), {"id": bid, "name": "Legacy farm sentinel", "type": "SOLE_PROP"})
        connection.execute(text('INSERT INTO "user" (id, role, business_id, is_active) VALUES (:uid, :role, :bid, true)'), {"uid": uid, "role": "OWNER", "bid": bid})
        connection.execute(text('INSERT INTO audit_event (id, business_id, actor, action, target, at) VALUES (:id, :bid, :uid, :action, :target, :at)'), {"id": audit, "bid": bid, "uid": uid, "action": "business.create", "target": f"business:{bid}", "at": datetime.now(UTC)})
    command.upgrade(config, "a126002")
    eid, cid = uuid.uuid4(), uuid.uuid4()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO farm_enterprise (id, business_id, name, type, subtype, metadata_json) VALUES (:id, :bid, 'Tomato cultivation', 'CROP', 'tomato', '{}')"), {"id": eid, "bid": bid})
        connection.execute(text("INSERT INTO farm_cycle (id, business_id, enterprise_id, name, start_date, stage, metadata_json) VALUES (:id, :bid, :eid, '2026 main season', '2026-05-01', 'ACTIVE', '{}')"), {"id": cid, "bid": bid, "eid": eid})
        for kind, category, amount in (("EXPENSE", "Seeds", 135000), ("INCOME", "Produce sales", 720000)):
            connection.execute(text("INSERT INTO farm_entry (id, business_id, enterprise_id, cycle_id, shared_overhead, kind, occurred_on, amount_pesewas, category, description, created_by, updated_at) VALUES (:id, :bid, :eid, :cid, false, :kind, '2026-06-01', :amount, :category, 'Legacy farm entry', :uid, now())"),
                               {"id": uuid.uuid4(), "bid": bid, "eid": eid, "cid": cid, "kind": kind, "amount": amount, "category": category, "uid": uid})
        connection.execute(text("INSERT INTO farm_entry (id, business_id, shared_overhead, kind, occurred_on, amount_pesewas, category, description, created_by, updated_at) VALUES (:id, :bid, true, 'EXPENSE', '2026-06-02', 5000, 'General overhead', 'Shared', :uid, now())"), {"id": uuid.uuid4(), "bid": bid, "uid": uid})
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with engine.connect() as connection:
        business = connection.execute(text('SELECT legal_name, is_demo FROM business WHERE id = :id'), {"id": bid}).one()
        assert business.legal_name == "Legacy farm sentinel" and business.is_demo is False
        assert connection.scalar(text('SELECT user_id FROM business_access WHERE business_id = :bid'), {"bid": bid}) == uid
        assert not inspect(connection).has_table("farm_entry")
        copied = connection.execute(text("SELECT direction, amount_pesewas, category_l1, category_l2, farm_activity, season, flags FROM transaction WHERE business_id = :bid ORDER BY amount_pesewas"), {"bid": bid}).all()
        assert [(row.direction, row.amount_pesewas, row.category_l1, row.category_l2, row.farm_activity, row.season) for row in copied] == [
            ("OUT", 5000, "opex", "Other costs", None, None),
            ("OUT", 135000, "cogs", "Seeds and seedlings", "Tomato", "2026 main season"),
            ("IN", 720000, "revenue", "Produce sales", "Tomato", "2026 main season"),
        ]
        assert all(row.flags["hand_entered"] for row in copied)
        assert connection.scalar(text("SELECT count(*) FROM document WHERE business_id = :bid AND doc_type = 'INFORMAL_LEDGER'"), {"bid": bid}) == 1
    command.check(config)
    engine.dispose()
