"""oauth clients and grants

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-09 23:51:06.267975
"""

from alembic import op
import sqlalchemy as sa
import app.db


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('oauth_clients',
    sa.Column('client_id', sa.String(length=64), nullable=False),
    sa.Column('info', sa.JSON(), nullable=False),
    sa.Column('created_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('client_id')
    )
    op.create_table('oauth_grants',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('client_id', sa.String(length=64), nullable=False),
    sa.Column('params', sa.JSON(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('code_hash', sa.String(length=64), nullable=True),
    sa.Column('expires_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['oauth_clients.client_id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code_hash')
    )


def downgrade() -> None:
    op.drop_table('oauth_grants')
    op.drop_table('oauth_clients')
