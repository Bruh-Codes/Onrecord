"""Remove the counterparty feature.

Revision ID: a2b4c6d8e0f1
Revises: f1a7b9c3d5e7
"""

from alembic import op
import sqlalchemy as sa


revision = "a2b4c6d8e0f1"
down_revision = "f1a7b9c3d5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("transaction_counterparty_id_fkey", "transaction", type_="foreignkey")
    op.drop_column("transaction", "counterparty_id")
    op.drop_table("counterparty")
    op.alter_column("transaction", "counterparty_raw", new_column_name="description")
    op.execute("DROP TYPE IF EXISTS counterpartykind")


def downgrade() -> None:
    op.execute(
        "CREATE TYPE counterpartykind AS ENUM "
        "('CUSTOMER', 'SUPPLIER', 'STAFF', 'LENDER', 'TAX', 'SELF', 'UNKNOWN')"
    )
    op.create_table(
        "counterparty",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("msisdn_hash", sa.String(), nullable=True),
        sa.Column("display_suffix", sa.String(length=4), nullable=True),
        sa.Column("kind", sa.Enum(name="counterpartykind"), nullable=False),
        sa.Column("first_seen", sa.Date(), nullable=True),
        sa.Column("last_seen", sa.Date(), nullable=True),
        sa.Column("txn_count", sa.Integer(), nullable=False),
        sa.Column("total_in_pesewas", sa.BigInteger(), nullable=False),
        sa.Column("total_out_pesewas", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["business.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("transaction", "description", new_column_name="counterparty_raw")
    op.add_column("transaction", sa.Column("counterparty_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "transaction_counterparty_id_fkey",
        "transaction",
        "counterparty",
        ["counterparty_id"],
        ["id"],
    )
