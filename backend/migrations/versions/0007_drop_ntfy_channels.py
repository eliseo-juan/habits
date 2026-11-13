"""drop ntfy channels

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-13 12:00:00.000000
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM notification_channels WHERE type = 'ntfy'")


def downgrade() -> None:
    pass  # the removed ntfy topics are gone for good
