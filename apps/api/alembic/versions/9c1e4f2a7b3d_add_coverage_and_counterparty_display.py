"""add coverage_json and counterparty display_suffix

Revision ID: 9c1e4f2a7b3d
Revises: 820f7fe778b4
Create Date: 2026-09-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9c1e4f2a7b3d'
down_revision: Union[str, Sequence[str], None] = '820f7fe778b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('business', sa.Column('coverage_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('counterparty', sa.Column('display_suffix', sa.String(length=4), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('counterparty', 'display_suffix')
    op.drop_column('business', 'coverage_json')