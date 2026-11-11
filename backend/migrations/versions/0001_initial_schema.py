"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-09 20:20:40.564131
"""

from alembic import op
import sqlalchemy as sa
import app.db


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('display_name', sa.String(length=120), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('day_cutoff', sa.Time(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('created_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.Column('disabled', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_table('api_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=64), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('scopes', sa.String(length=64), nullable=False),
    sa.Column('created_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.Column('last_used', app.db.UTCDateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    with op.batch_alter_table('api_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_api_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('habits',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('color', sa.String(length=16), nullable=True),
    sa.Column('icon', sa.String(length=64), nullable=True),
    sa.Column('priority', sa.Integer(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('stats_start_date', sa.Date(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('habits', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_habits_user_id'), ['user_id'], unique=False)

    op.create_table('notification_channels',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(length=32), nullable=False),
    sa.Column('config', sa.JSON(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('notification_channels', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notification_channels_user_id'), ['user_id'], unique=False)

    op.create_table('sessions',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('expires_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sessions_user_id'), ['user_id'], unique=False)

    op.create_table('habit_schedules',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('habit_id', sa.Integer(), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('schedule_type', sa.String(length=32), nullable=False),
    sa.Column('times_per_day', sa.Integer(), nullable=False),
    sa.Column('weekdays', sa.Integer(), nullable=True),
    sa.Column('period_unit', sa.String(length=8), nullable=True),
    sa.Column('period_target', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['habit_id'], ['habits.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('habit_id', 'effective_from')
    )
    with op.batch_alter_table('habit_schedules', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_habit_schedules_habit_id'), ['habit_id'], unique=False)

    op.create_table('logs',
    sa.Column('habit_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('done_count', sa.Integer(), nullable=False),
    sa.Column('skipped', sa.Boolean(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('source', sa.String(length=64), nullable=True),
    sa.Column('updated_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['habit_id'], ['habits.id'], ),
    sa.PrimaryKeyConstraint('habit_id', 'date')
    )
    op.create_table('reminders',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('habit_id', sa.Integer(), nullable=False),
    sa.Column('time_local', sa.Time(), nullable=False),
    sa.Column('weekdays', sa.Integer(), nullable=True),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['habit_id'], ['habits.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reminders', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reminders_habit_id'), ['habit_id'], unique=False)

    op.create_table('notification_log',
    sa.Column('reminder_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('sent_at', app.db.UTCDateTime(timezone=True), nullable=False),
    sa.Column('action_used_at', app.db.UTCDateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['reminder_id'], ['reminders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('reminder_id', 'date')
    )


def downgrade() -> None:
    op.drop_table('notification_log')
    with op.batch_alter_table('reminders', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reminders_habit_id'))

    op.drop_table('reminders')
    op.drop_table('logs')
    with op.batch_alter_table('habit_schedules', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_habit_schedules_habit_id'))

    op.drop_table('habit_schedules')
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sessions_user_id'))

    op.drop_table('sessions')
    with op.batch_alter_table('notification_channels', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notification_channels_user_id'))

    op.drop_table('notification_channels')
    with op.batch_alter_table('habits', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_habits_user_id'))

    op.drop_table('habits')
    with op.batch_alter_table('api_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_api_tokens_user_id'))

    op.drop_table('api_tokens')
    op.drop_table('users')
