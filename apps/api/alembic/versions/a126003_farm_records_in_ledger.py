"""Fold farm records into the main ledger.

Adds crop/animal (farm_activity) and season tags to transactions, copies every
farm_entry into the ledger, then drops the separate farm tables:
- typed-in entries become transactions on the business's "Records you typed in"
  cash book, with the enterprise as farm_activity and the cycle as season;
- entries that pointed at a statement transaction tag that transaction instead.
"""
import hashlib
import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "a126003"
down_revision = "a126002"
branch_labels = None
depends_on = None

# Old farm categories -> (new plain label, ledger category). Kept in step with
# app/services/hand_entries.py at the time of writing.
CATEGORY_MAP = {
    "Produce sales": ("Produce sales", "revenue"),
    "Egg sales": ("Animal sales", "revenue"),
    "Animal sales": ("Animal sales", "revenue"),
    "Milk sales": ("Animal sales", "revenue"),
    "Fish sales": ("Animal sales", "revenue"),
    "Other farm income": ("Other sales", "revenue"),
    "Seeds": ("Seeds and seedlings", "cogs"),
    "Fertilizer": ("Fertilizer and chemicals", "cogs"),
    "Feed": ("Feed", "cogs"),
    "Bird purchase": ("Animals or fingerlings bought", "cogs"),
    "Animal purchase": ("Animals or fingerlings bought", "cogs"),
    "Fingerlings": ("Animals or fingerlings bought", "cogs"),
    "Packaging": ("Packaging", "cogs"),
    "Labour": ("Labour", "opex"),
    "Harvesting": ("Labour", "opex"),
    "Land preparation": ("Land preparation", "opex"),
    "Irrigation": ("Water and power", "opex"),
    "Utilities": ("Water and power", "opex"),
    "Power": ("Water and power", "opex"),
    "Shared electricity": ("Water and power", "opex"),
    "Transport": ("Transport", "opex"),
    "Shared transport": ("Transport", "opex"),
    "Equipment": ("Equipment and repairs", "opex"),
    "Maintenance": ("Equipment and repairs", "opex"),
    "Veterinary": ("Vet and medicine", "opex"),
    "Medication": ("Vet and medicine", "opex"),
}


def _activity(name, subtype):
    if subtype and subtype != "other":
        return subtype.capitalize()
    return name


def _book(conn, business_id, user_id, cache):
    if business_id in cache:
        return cache[business_id]
    identifier = hashlib.sha256(f"hand-entered:{business_id}".encode()).hexdigest()
    account_id = conn.scalar(sa.text("SELECT id FROM account WHERE business_id = :b AND identifier_hash = :h"),
                             {"b": business_id, "h": identifier})
    if account_id is None:
        account_id = uuid.uuid4()
        conn.execute(sa.text(
            "INSERT INTO account (id, business_id, kind, provider, identifier_hash, display_suffix, currency) "
            "VALUES (:id, :b, 'CASH_BOOK', 'OTHER_BANK', :h, 'HAND', 'GHS')"
        ), {"id": account_id, "b": business_id, "h": identifier})
    sha = hashlib.sha256(f"onrecord-hand-entered:{business_id}".encode()).hexdigest()
    document_id = conn.scalar(sa.text(
        "SELECT id FROM document WHERE business_id = :b AND sha256 = :s AND deleted_at IS NULL"
    ), {"b": business_id, "s": sha})
    if document_id is None:
        document_id = uuid.uuid4()
        conn.execute(sa.text(
            "INSERT INTO document (id, business_id, uploaded_by, storage_key, sha256, mime, page_count, doc_type, "
            "doc_type_confidence, status, quality_flags) VALUES (:id, :b, :u, :key, :s, 'text/plain', 1, "
            "'INFORMAL_LEDGER', 1, 'EXTRACTED', CAST(:flags AS jsonb))"
        ), {"id": document_id, "b": business_id, "u": user_id, "key": f"{business_id}/hand-entered/Records you typed in",
            "s": sha, "flags": json.dumps({"hand_entered": True})})
    cache[business_id] = (account_id, document_id)
    return cache[business_id]


def upgrade():
    op.add_column("transaction", sa.Column("farm_activity", sa.String(80), nullable=True))
    op.add_column("transaction", sa.Column("season", sa.String(80), nullable=True))
    op.create_index("ix_transaction_business_farm", "transaction", ["business_id", "farm_activity", "season"])

    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT e.business_id, e.kind, e.occurred_on, e.amount_pesewas, e.category, e.description, "
        "e.source_transaction_id, e.created_by, e.external_key, en.name AS enterprise_name, en.subtype, "
        "c.name AS cycle_name, b.is_demo "
        "FROM farm_entry e JOIN business b ON b.id = e.business_id "
        "LEFT JOIN farm_enterprise en ON en.id = e.enterprise_id "
        "LEFT JOIN farm_cycle c ON c.id = e.cycle_id "
        "WHERE e.deleted_at IS NULL ORDER BY e.business_id, e.occurred_on"
    )).mappings().all()
    books = {}
    for row in rows:
        activity = _activity(row["enterprise_name"], row["subtype"]) if row["enterprise_name"] else None
        season = row["cycle_name"]
        if row["source_transaction_id"]:
            conn.execute(sa.text(
                "UPDATE transaction SET farm_activity = COALESCE(farm_activity, :a), season = COALESCE(season, :s) "
                "WHERE id = :id"
            ), {"a": activity, "s": season, "id": row["source_transaction_id"]})
            continue
        income = row["kind"] == "INCOME"
        label, ledger = CATEGORY_MAP.get(row["category"], ("Other sales", "revenue") if income else ("Other costs", "opex"))
        account_id, document_id = _book(conn, row["business_id"], row["created_by"], books)
        extraction_id = uuid.uuid4()
        conn.execute(sa.text(
            "INSERT INTO extraction (id, document_id, page, field_path, value_json, extractor, confidence) "
            "VALUES (:id, :d, 1, 'hand_entry', CAST(:v AS jsonb), 'farm_entry_migration', 1)"
        ), {"id": extraction_id, "d": document_id, "v": json.dumps({
            "direction": "in" if income else "out", "occurred_on": row["occurred_on"].isoformat(),
            "amount_pesewas": row["amount_pesewas"], "category": row["category"], "description": row["description"],
            "entered_by": str(row["created_by"]),
        })})
        flags = {"hand_entered": True, "owner_confirmed": True}
        if row["is_demo"] or row["external_key"]:
            flags["example"] = True
        conn.execute(sa.text(
            "INSERT INTO transaction (id, business_id, account_id, document_id, occurred_on, direction, amount_pesewas, "
            "fee_pesewas, levy_pesewas, description, category_l1, category_l2, category_confidence, category_source, "
            "farm_activity, season, flags, provenance) VALUES (:id, :b, :acc, :d, :on, :dir, :amt, 0, 0, :desc, :l1, :l2, "
            "1, 'OWNER_STATED', :a, :s, CAST(:flags AS jsonb), CAST(:prov AS jsonb))"
        ), {"id": uuid.uuid4(), "b": row["business_id"], "acc": account_id, "d": document_id, "on": row["occurred_on"],
            "dir": "IN" if income else "OUT", "amt": row["amount_pesewas"], "desc": row["description"], "l1": ledger,
            "l2": label, "a": activity, "s": season, "flags": json.dumps(flags),
            "prov": json.dumps({"extraction_ids": [str(extraction_id)], "value_kind": "declared"})})

    op.drop_table("farm_entry")
    op.drop_table("farm_cycle")
    op.drop_table("farm_enterprise")
    for name in ("farmkind", "cyclestage", "farmtype"):
        pg.ENUM(name=name).drop(conn, checkfirst=True)


def downgrade():
    # The farm tables come back empty; copied records stay in the ledger.
    def identity():
        return [sa.Column("id", sa.UUID(), primary_key=True),
                sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]

    op.create_table(
        "farm_enterprise", *identity(),
        sa.Column("business_id", sa.UUID(), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("type", sa.Enum("CROP", "LIVESTOCK", "AQUACULTURE", name="farmtype"), nullable=False),
        sa.Column("subtype", sa.String(60), nullable=False),
        sa.Column("region", sa.String(100)),
        sa.Column("metadata_json", pg.JSONB(), nullable=False),
        sa.Column("external_key", sa.String(160)),
        sa.UniqueConstraint("id", "business_id", name="uq_enterprise_business"),
        sa.UniqueConstraint("business_id", "external_key", name="uq_enterprise_seed"),
    )
    op.create_index("ix_farm_enterprise_business_id", "farm_enterprise", ["business_id"])
    op.create_table(
        "farm_cycle", *identity(),
        sa.Column("business_id", sa.UUID(), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("enterprise_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("expected_harvest_date", sa.Date()),
        sa.Column("stage", sa.Enum("PLANNED", "ACTIVE", "COMPLETED", name="cyclestage"), nullable=False),
        sa.Column("metadata_json", pg.JSONB(), nullable=False),
        sa.Column("external_key", sa.String(160)),
        sa.ForeignKeyConstraint(["enterprise_id", "business_id"], ["farm_enterprise.id", "farm_enterprise.business_id"]),
        sa.UniqueConstraint("id", "enterprise_id", "business_id", name="uq_cycle_enterprise_business"),
        sa.UniqueConstraint("business_id", "external_key", name="uq_cycle_seed"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_cycle_dates"),
    )
    op.create_index("ix_farm_cycle_business_id", "farm_cycle", ["business_id"])
    op.create_table(
        "farm_entry", *identity(),
        sa.Column("business_id", sa.UUID(), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("enterprise_id", sa.UUID()),
        sa.Column("cycle_id", sa.UUID()),
        sa.Column("shared_overhead", sa.Boolean(), nullable=False),
        sa.Column("kind", sa.Enum("INCOME", "EXPENSE", name="farmkind"), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("amount_pesewas", sa.BigInteger()),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("description", sa.String(400), nullable=False),
        sa.Column("source_transaction_id", sa.UUID(), sa.ForeignKey("transaction.id")),
        sa.Column("evidence_document_id", sa.UUID(), sa.ForeignKey("document.id")),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("external_key", sa.String(160)),
        sa.ForeignKeyConstraint(["enterprise_id", "business_id"], ["farm_enterprise.id", "farm_enterprise.business_id"]),
        sa.ForeignKeyConstraint(["cycle_id", "enterprise_id", "business_id"], ["farm_cycle.id", "farm_cycle.enterprise_id", "farm_cycle.business_id"]),
        sa.CheckConstraint("cycle_id IS NULL OR enterprise_id IS NOT NULL", name="ck_entry_cycle_enterprise"),
        sa.CheckConstraint("(enterprise_id IS NULL AND shared_overhead) OR (enterprise_id IS NOT NULL AND NOT shared_overhead)", name="ck_entry_scope"),
        sa.CheckConstraint("NOT shared_overhead OR kind = 'EXPENSE'", name="ck_overhead_expense"),
        sa.CheckConstraint("(source_transaction_id IS NULL AND amount_pesewas IS NOT NULL AND amount_pesewas > 0) OR (source_transaction_id IS NOT NULL AND amount_pesewas IS NULL)", name="ck_entry_source_amount"),
        sa.UniqueConstraint("business_id", "external_key", name="uq_entry_seed"),
    )
    op.create_index("ix_farm_entry_business_date", "farm_entry", ["business_id", "occurred_on"])
    op.create_index("uq_farm_entry_active_source", "farm_entry", ["source_transaction_id"], unique=True, postgresql_where=sa.text("deleted_at IS NULL"))
    op.drop_index("ix_transaction_business_farm", table_name="transaction")
    op.drop_column("transaction", "season")
    op.drop_column("transaction", "farm_activity")
