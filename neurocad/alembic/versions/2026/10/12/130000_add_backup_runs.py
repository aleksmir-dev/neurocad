"""add backup_runs

Revision ID: c4d5e6f7a8b9
Revises: b7c3e9f1a2d4
Create Date: 2026-10-12 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b7c3e9f1a2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'backup_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_backup_runs_level_finished', 'backup_runs', ['level', 'finished_at'])
    op.create_index('idx_backup_runs_status', 'backup_runs', ['status'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_backup_runs_status', table_name='backup_runs')
    op.drop_index('idx_backup_runs_level_finished', table_name='backup_runs')
    op.drop_table('backup_runs')