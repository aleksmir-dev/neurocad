"""add content_json to page_hist

Revision ID: f84188c16e8f
Revises: f874d9a9f0e2
Create Date: 2026-09-22 07:03:36.854881

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f84188c16e8f'
down_revision: Union[str, Sequence[str], None] = 'f874d9a9f0e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('page_hist', sa.Column('content_json', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('page_hist', 'content_json')