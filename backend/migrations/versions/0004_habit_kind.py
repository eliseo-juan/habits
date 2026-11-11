"""habit kind

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-10 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("habits", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("kind", sa.String(length=8), server_default="build", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("habits", schema=None) as batch_op:
        batch_op.drop_column("kind")
