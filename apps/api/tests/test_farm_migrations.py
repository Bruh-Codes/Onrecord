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
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with engine.connect() as connection:
        business = connection.execute(text('SELECT legal_name, is_demo FROM business WHERE id = :id'), {"id": bid}).one()
        assert business.legal_name == "Legacy farm sentinel" and business.is_demo is False
        assert connection.scalar(text('SELECT user_id FROM business_access WHERE business_id = :bid'), {"bid": bid}) == uid
        assert connection.scalar(text('SELECT count(*) FROM farm_entry')) == 0
    command.check(config)
    engine.dispose()
