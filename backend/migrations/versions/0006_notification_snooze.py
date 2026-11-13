"""notification snooze

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-13 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

from app.db import UTCDateTime

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notification_log", schema=None) as batch_op:
        batch_op.add_column(sa.Column("snoozed_until", UTCDateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notification_log", schema=None) as batch_op:
        batch_op.drop_column("snoozed_until")
