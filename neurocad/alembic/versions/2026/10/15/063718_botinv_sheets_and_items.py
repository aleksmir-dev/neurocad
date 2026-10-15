"""botinv sheets and items

Revision ID: 72616a53321a
Revises: d5e6f7a8b9c0
Create Date: 2026-10-15 06:37:18.596347

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "72616a53321a"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "botinv_sheets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nav_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("batch_date", sa.Date(), nullable=False),
        sa.Column("source_file", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Integer(), nullable=True),
        sa.Column("is_delete", sa.Integer(), nullable=True),
        sa.Column("items_count", sa.Integer(), nullable=True),
        sa.Column("marked_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["nav_id"],
            ["nav.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_botinv_sheets_is_active",
        "botinv_sheets",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "idx_botinv_sheets_is_delete",
        "botinv_sheets",
        ["is_delete"],
        unique=False,
    )
    op.create_index(
        "idx_botinv_sheets_nav_id", "botinv_sheets", ["nav_id"], unique=False
    )
    op.create_table(
        "botinv_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.Integer(), nullable=False),
        sa.Column("inv_num", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("room_before", sa.String(length=64), nullable=True),
        sa.Column("room_after", sa.String(length=64), nullable=True),
        sa.Column("found", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("marked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["sheet_id"],
            ["botinv_sheets.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "sheet_id", "inv_num", name="uq_botinv_sheet_invnum"
        ),
    )
    op.create_index(
        "idx_botinv_items_inv_num", "botinv_items", ["inv_num"], unique=False
    )
    op.create_index(
        "idx_botinv_items_room_before",
        "botinv_items",
        ["room_before"],
        unique=False,
    )
    op.create_index(
        "idx_botinv_items_sheet_id", "botinv_items", ["sheet_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_botinv_items_sheet_id", table_name="botinv_items")
    op.drop_index("idx_botinv_items_room_before", table_name="botinv_items")
    op.drop_index("idx_botinv_items_inv_num", table_name="botinv_items")
    op.drop_table("botinv_items")
    op.drop_index("idx_botinv_sheets_nav_id", table_name="botinv_sheets")
    op.drop_index("idx_botinv_sheets_is_delete", table_name="botinv_sheets")
    op.drop_index("idx_botinv_sheets_is_active", table_name="botinv_sheets")
    op.drop_table("botinv_sheets")