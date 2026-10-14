"""panel models

Revision ID: b7c3e9f1a2d4
Revises: 0943e8bd752c
Create Date: 2026-10-12 12:00:00.000000

"""

from typing import Sequence, Union
from datetime import datetime as dt

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b7c3e9f1a2d4"
down_revision: Union[str, Sequence[str], None] = "0943e8bd752c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # === panel_limits ===
    op.create_table(
        'panel_limits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subsystem', sa.String(length=64), nullable=False),
        sa.Column('metric', sa.String(length=64), nullable=False),
        sa.Column('warning', sa.Float(), nullable=False),
        sa.Column('error', sa.Float(), nullable=False),
        sa.Column('timeout', sa.Float(), nullable=False, server_default='3.0'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('subsystem', 'metric', name='uq_panel_limit_sub_met'),
    )
    op.create_index('idx_panel_limits_subsystem', 'panel_limits', ['subsystem'])

    # === panel_limits_hist ===
    op.create_table(
        'panel_limits_hist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('limit_id', sa.Integer(), nullable=False),
        sa.Column('old_value', sa.Text(), nullable=False),
        sa.Column('new_value', sa.Text(), nullable=False),
        sa.Column('changed_by', sa.Integer(), nullable=True),
        sa.Column('changed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['limit_id'], ['panel_limits.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_panel_limits_hist_limit_id', 'panel_limits_hist', ['limit_id'])
    op.create_index('idx_panel_limits_hist_changed_at', 'panel_limits_hist', ['changed_at'])

    # === panel_stats ===
    op.create_table(
        'panel_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('taken_at', sa.DateTime(), nullable=False),
        sa.Column('trigger', sa.String(length=16), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('data', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_panel_stats_taken_at', 'panel_stats', ['taken_at'])
    op.create_index('idx_panel_stats_trigger', 'panel_stats', ['trigger'])

    # === panel_tasks ===
    op.create_table(
        'panel_tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=128), nullable=False),
        sa.Column('url', sa.String(length=255), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('cron', sa.String(length=128), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(length=16), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('next_run_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index('idx_panel_tasks_name', 'panel_tasks', ['name'])
    op.create_index('idx_panel_tasks_active', 'panel_tasks', ['active'])

    # === panel_tasks_hist ===
    op.create_table(
        'panel_tasks_hist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('old_cron', sa.String(length=128), nullable=False),
        sa.Column('new_cron', sa.String(length=128), nullable=False),
        sa.Column('old_active', sa.Boolean(), nullable=False),
        sa.Column('new_active', sa.Boolean(), nullable=False),
        sa.Column('changed_by', sa.Integer(), nullable=True),
        sa.Column('changed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['panel_tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_panel_tasks_hist_task_id', 'panel_tasks_hist', ['task_id'])
    op.create_index('idx_panel_tasks_hist_changed_at', 'panel_tasks_hist', ['changed_at'])

    # === Seed: default limits ===
    panel_limits = sa.table(
        'panel_limits',
        sa.column('subsystem', sa.String),
        sa.column('metric', sa.String),
        sa.column('warning', sa.Float),
        sa.column('error', sa.Float),
        sa.column('timeout', sa.Float),
        sa.column('updated_at', sa.DateTime),
    )

    now = dt.now()
    op.bulk_insert(panel_limits, [
        # "higher is worse" — warning < error
        {'subsystem': 'backups',   'metric': 'age_hours',      'warning': 4,    'error': 8,    'timeout': 1, 'updated_at': now},
        {'subsystem': 'disk',      'metric': 'percent',        'warning': 70,   'error': 85,   'timeout': 1, 'updated_at': now},
        {'subsystem': 'ram',       'metric': 'percent',        'warning': 70,   'error': 90,   'timeout': 1, 'updated_at': now},
        {'subsystem': 'llm',       'metric': 'ping_ms',        'warning': 3000, 'error': 5000, 'timeout': 5, 'updated_at': now},
        {'subsystem': 'tokens',    'metric': 'daily_millions', 'warning': 20,   'error': 50,   'timeout': 1, 'updated_at': now},
        {'subsystem': 'publish',   'metric': 'age_hours',      'warning': 72,   'error': 168,  'timeout': 1, 'updated_at': now},
        {'subsystem': 'db',        'metric': 'ping_ms',        'warning': 500,  'error': 1000, 'timeout': 2, 'updated_at': now},
        {'subsystem': 'scheduler', 'metric': 'age_minutes',    'warning': 120,  'error': 240,  'timeout': 1, 'updated_at': now},
        # "higher is better" — warning > error
        {'subsystem': 'users',     'metric': 'daily_new_min',  'warning': 1,    'error': 0,    'timeout': 1, 'updated_at': now},
    ])

    # === Seed: default task ===
    panel_tasks = sa.table(
        'panel_tasks',
        sa.column('name', sa.String),
        sa.column('title', sa.String),
        sa.column('url', sa.String),
        sa.column('active', sa.Boolean),
        sa.column('cron', sa.String),
        sa.column('updated_at', sa.DateTime),
    )

    op.bulk_insert(panel_tasks, [
        {
            'name': 'metrics_hourly',
            'title': 'Журнал метрик',
            'url': '/services/panel/metrics',
            'active': True,
            'cron': '0 * * * *',
            'updated_at': now,
        },
    ])


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_index('idx_panel_tasks_hist_changed_at', table_name='panel_tasks_hist')
    op.drop_index('idx_panel_tasks_hist_task_id', table_name='panel_tasks_hist')
    op.drop_table('panel_tasks_hist')

    op.drop_index('idx_panel_tasks_active', table_name='panel_tasks')
    op.drop_index('idx_panel_tasks_name', table_name='panel_tasks')
    op.drop_table('panel_tasks')

    op.drop_index('idx_panel_stats_trigger', table_name='panel_stats')
    op.drop_index('idx_panel_stats_taken_at', table_name='panel_stats')
    op.drop_table('panel_stats')

    op.drop_index('idx_panel_limits_hist_changed_at', table_name='panel_limits_hist')
    op.drop_index('idx_panel_limits_hist_limit_id', table_name='panel_limits_hist')
    op.drop_table('panel_limits_hist')

    op.drop_index('idx_panel_limits_subsystem', table_name='panel_limits')
    op.drop_table('panel_limits')