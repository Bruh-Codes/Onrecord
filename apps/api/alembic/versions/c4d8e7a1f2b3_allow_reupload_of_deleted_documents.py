"""Allow a file to be uploaded again after its prior upload is removed.

Revision ID: c4d8e7a1f2b3
Revises: 9c1e4f2a7b3d
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa


revision = "c4d8e7a1f2b3"
down_revision = "9c1e4f2a7b3d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_document_business_sha256", "document", type_="unique")
    op.create_index(
        "uq_document_business_sha256_active",
        "document",
        ["business_id", "sha256"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_document_business_sha256_active", table_name="document")
    op.create_unique_constraint("uq_document_business_sha256", "document", ["business_id", "sha256"])
