"""sync

Revision ID: 7f1e208441a6
Revises: 72616a53321a
Create Date: 2026-10-15 06:40:53.380351

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "7f1e208441a6"
down_revision: Union[str, Sequence[str], None] = "72616a53321a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    SQLite does not support ALTER COLUMN. Use batch_alter_table:
    it rebuilds the table with the target schema.
    """
    with op.batch_alter_table("botinv_sheets", schema=None) as batch_op:
        batch_op.alter_column(
            "is_active", existing_type=sa.INTEGER(), nullable=False
        )
        batch_op.alter_column(
            "is_delete", existing_type=sa.INTEGER(), nullable=False
        )
        batch_op.alter_column(
            "items_count", existing_type=sa.INTEGER(), nullable=False
        )
        batch_op.alter_column(
            "marked_count", existing_type=sa.INTEGER(), nullable=False
        )
        batch_op.alter_column(
            "created_at", existing_type=sa.DATETIME(), nullable=False
        )
        batch_op.alter_column(
            "updated_at", existing_type=sa.DATETIME(), nullable=False
        )

    with op.batch_alter_table("botinv_items", schema=None) as batch_op:
        batch_op.alter_column(
            "found", existing_type=sa.INTEGER(), nullable=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("botinv_items", schema=None) as batch_op:
        batch_op.alter_column(
            "found", existing_type=sa.INTEGER(), nullable=True
        )

    with op.batch_alter_table("botinv_sheets", schema=None) as batch_op:
        batch_op.alter_column(
            "updated_at", existing_type=sa.DATETIME(), nullable=True
        )
        batch_op.alter_column(
            "created_at", existing_type=sa.DATETIME(), nullable=True
        )
        batch_op.alter_column(
            "marked_count", existing_type=sa.INTEGER(), nullable=True
        )
        batch_op.alter_column(
            "items_count", existing_type=sa.INTEGER(), nullable=True
        )
        batch_op.alter_column(
            "is_delete", existing_type=sa.INTEGER(), nullable=True
        )
        batch_op.alter_column(
            "is_active", existing_type=sa.INTEGER(), nullable=True
        )