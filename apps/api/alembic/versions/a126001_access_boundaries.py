"""Explicit business access and task ownership; preserve existing business rows.

Only creation-audit-backed owner associations are migrated automatically.
Ambiguous legacy associations must be reviewed rather than silently trusted.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a126001"
down_revision = "a2b4c6d8e0f1"
branch_labels = None
depends_on = None


def upgrade():
    role = postgresql.ENUM("OWNER", "REVIEWER", "ADMIN", name="role", create_type=False)
    op.create_table(
        "business_access",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("business_id", sa.UUID(), sa.ForeignKey("business.id"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("role", role, nullable=False),
        sa.UniqueConstraint("business_id", "user_id", name="uq_business_access_user"),
    )
    # Audit IDs are globally unique UUIDs, and each creation event names its owner.
    op.execute("""
        INSERT INTO business_access (id, business_id, user_id, role)
        SELECT DISTINCT ON (a.business_id, a.actor)
            a.id, a.business_id, a.actor, u.role
        FROM audit_event a JOIN "user" u ON u.id = a.actor
        WHERE a.action = 'business.create' AND a.business_id IS NOT NULL
            AND u.role::text = 'OWNER'
        ORDER BY a.business_id, a.actor, a.at
        ON CONFLICT (business_id, user_id) DO NOTHING
    """)
    op.create_table(
        "business_task",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("task_key", sa.String(64), nullable=False, unique=True),
        sa.Column("business_id", sa.UUID(), sa.ForeignKey("business.id"), nullable=False),
    )


def downgrade():
    op.drop_table("business_task")
    op.drop_table("business_access")
