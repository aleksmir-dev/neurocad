"""add is_template and template_id to pages

Revision ID: f874d9a9f0e2
Revises: dc21e1cd720c
Create Date: 2026-09-20 20:34:43.935428

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f874d9a9f0e2'
down_revision: Union[str, Sequence[str], None] = 'dc21e1cd720c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_template and template_id to pages."""
    # Use batch_alter_table for SQLite compatibility.
    # SQLite does not support ALTER TABLE ... ADD CONSTRAINT,
    # so FK is not added. We keep the column only (FK is logical).
    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_template', sa.Integer(), nullable=False, server_default='0')
        )
        batch_op.add_column(
            sa.Column('template_id', sa.Integer(), nullable=True)
        )
        batch_op.create_index('idx_pages_is_template', ['is_template'], unique=False)
        batch_op.create_index('idx_pages_template_id', ['template_id'], unique=False)


def downgrade() -> None:
    """Remove is_template and template_id from pages."""
    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.drop_index('idx_pages_template_id')
        batch_op.drop_index('idx_pages_is_template')
        batch_op.drop_column('template_id')
        batch_op.drop_column('is_template')