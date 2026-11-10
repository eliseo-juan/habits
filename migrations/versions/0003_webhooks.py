"""webhooks

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10 11:10:51.924176
"""

from alembic import op
import sqlalchemy as sa
import app.db

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('webhooks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=2048), nullable=False),
    sa.Column('created_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'url')
    )
    with op.batch_alter_table('webhooks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_webhooks_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('webhooks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_webhooks_user_id'))

    op.drop_table('webhooks')
