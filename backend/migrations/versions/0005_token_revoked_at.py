"""api token revoked_at

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-11 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

from app.db import UTCDateTime

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.add_column(sa.Column("revoked_at", UTCDateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.drop_column("revoked_at")
