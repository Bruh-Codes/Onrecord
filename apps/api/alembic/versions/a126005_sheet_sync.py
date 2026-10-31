"""Connected spreadsheets that OnRecord keeps reading (Google Sheets auto-sync).

sheet_connection holds the chosen file, tab and confirmed column mapping;
sheet_row remembers each row seen, so later syncs add only new rows and keep
the history of edits and deletions.
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision = "a126005"
down_revision = "a126004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sheet_connection",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("business_id", pg.UUID(as_uuid=True), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("connected_by", pg.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("spreadsheet_id", sa.String(200), nullable=False),
        sa.Column("spreadsheet_name", sa.String(), nullable=False),
        sa.Column("sheet_gid", sa.Integer(), nullable=False),
        sa.Column("sheet_title", sa.String(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("mapping", pg.JSONB(), nullable=True),
        sa.Column("mapping_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_id", pg.UUID(as_uuid=True), sa.ForeignKey("document.id"), nullable=True),
        sa.Column("account_id", pg.UUID(as_uuid=True), sa.ForeignKey("account.id"), nullable=True),
        sa.Column("remote_modified_at", sa.String(64), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("last_result", pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_sheet_connection_live_tab", "sheet_connection", ["business_id", "spreadsheet_id", "sheet_gid"],
        unique=True, postgresql_where=sa.text("status <> 'disconnected'"),
    )
    op.create_index("ix_sheet_connection_status_checked", "sheet_connection", ["status", "last_checked_at"])

    op.create_table(
        "sheet_row",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("connection_id", pg.UUID(as_uuid=True), sa.ForeignKey("sheet_connection.id"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("occurrence", sa.Integer(), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("values", pg.JSONB(), nullable=False),
        sa.Column("parsed", pg.JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("review_reason", sa.String(40), nullable=True),
        sa.Column("transaction_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("extraction_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("initial_import", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("history", pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.UniqueConstraint("connection_id", "fingerprint", "occurrence", name="uq_sheet_row_fingerprint"),
    )
    op.create_index("ix_sheet_row_connection_status", "sheet_row", ["connection_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_sheet_row_connection_status", table_name="sheet_row")
    op.drop_table("sheet_row")
    op.drop_index("ix_sheet_connection_status_checked", table_name="sheet_connection")
    op.drop_index("uq_sheet_connection_live_tab", table_name="sheet_connection")
    op.drop_table("sheet_connection")
