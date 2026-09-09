"""Store Docling's lossless document representation.

Revision ID: e5f9a2b4c6d8
Revises: c4d8e7a1f2b3
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e5f9a2b4c6d8"
down_revision = "c4d8e7a1f2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("docling_document", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document", "docling_document")
