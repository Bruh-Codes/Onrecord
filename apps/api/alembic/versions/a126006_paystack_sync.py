"""Paystack auto-sync: a connection per business and new enum values.

paystack_connection holds the owner's encrypted secret key and how far
OnRecord has read. Payments land on a POS account (provider PAYSTACK) and a
processor_statement document, so they count as provider evidence.
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision = "a126006"
down_revision = "a126005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres can't use a new enum value inside the transaction that adds it,
    # and nothing below uses them, but run them outside one to be safe.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE provider ADD VALUE IF NOT EXISTS 'PAYSTACK'")
        op.execute("ALTER TYPE doctype ADD VALUE IF NOT EXISTS 'PROCESSOR_STATEMENT'")

    op.create_table(
        "paystack_connection",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("business_id", pg.UUID(as_uuid=True), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("connected_by", pg.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("key_ciphertext", sa.String(), nullable=True),
        sa.Column("key_last4", sa.String(4), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("document_id", pg.UUID(as_uuid=True), sa.ForeignKey("document.id"), nullable=True),
        sa.Column("account_id", pg.UUID(as_uuid=True), sa.ForeignKey("account.id"), nullable=True),
        sa.Column("synced_through", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("last_result", pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_paystack_connection_live", "paystack_connection", ["business_id"],
        unique=True, postgresql_where=sa.text("status <> 'disconnected'"),
    )
    op.create_index("ix_paystack_connection_status_checked", "paystack_connection", ["status", "last_checked_at"])


def downgrade() -> None:
    op.drop_index("ix_paystack_connection_status_checked", table_name="paystack_connection")
    op.drop_index("uq_paystack_connection_live", table_name="paystack_connection")
    op.drop_table("paystack_connection")
    # Postgres can't drop enum values; PAYSTACK and PROCESSOR_STATEMENT stay.
