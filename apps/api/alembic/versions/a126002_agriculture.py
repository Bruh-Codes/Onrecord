"""Add farm records without changing the document-derived ledger."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = "a126002"
down_revision = "a126001"
branch_labels = None
depends_on = None


def identity():
    return [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade():
    op.add_column("business", sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("business", sa.Column("demo_seed_key", sa.String(160), nullable=True))
    op.create_unique_constraint("uq_business_demo_seed_key", "business", ["demo_seed_key"])
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


def downgrade():
    op.drop_table("farm_entry")
    op.drop_table("farm_cycle")
    op.drop_table("farm_enterprise")
    for name in ("farmkind", "cyclestage", "farmtype"):
        pg.ENUM(name=name).drop(op.get_bind())
    op.drop_constraint("uq_business_demo_seed_key", "business", type_="unique")
    op.drop_column("business", "demo_seed_key")
    op.drop_column("business", "is_demo")
