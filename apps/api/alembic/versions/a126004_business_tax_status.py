"""Add the owner's declared tax status to business.

One of farm_produce, flat_tax, vat_registered or not_sure (app/schemas/business.py).
"""
import sqlalchemy as sa
from alembic import op

revision = "a126004"
down_revision = "a126003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("business", sa.Column("tax_status", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("business", "tax_status")
