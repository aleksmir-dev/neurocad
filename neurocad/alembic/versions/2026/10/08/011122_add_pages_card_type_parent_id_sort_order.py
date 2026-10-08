"""add pages.card_type, parent_id, sort_order

Revision ID: eb92c1246d84
Revises: bd36e37c3294
Create Date: 2026-10-08 01:11:22.146671

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "eb92c1246d84"
down_revision: Union[str, Sequence[str], None] = "bd36e37c3294"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Adds three columns to `pages` (card_type, parent_id,
    sort_order) and makes `datetime` nullable. Also creates two
    indexes and a self-referencing FK (parent_id -> pages.id).

    Why batch_alter_table:
        The "make datetime nullable" step is an ALTER COLUMN, which
        SQLite does NOT support natively. Alembic's batch mode
        works around this by rebuilding the table: it creates a new
        table with the target schema, copies the rows, drops the
        old one, and renames the new one. This is the recommended
        path for SQLite and is what the "render_as_batch" flag in
        env.py would produce anyway.

        The three ADD COLUMN steps could be done directly (SQLite
        supports ADD COLUMN), but we run the whole thing inside one
        batch block so the FK and the NULL change are also applied
        cleanly. On other backends (PostgreSQL, MySQL) batch mode
        degrades to normal ALTER TABLE — no rebuild, no data copy.
    """
    with op.batch_alter_table("pages", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "card_type",
                sa.String(length=16),
                server_default="page",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("parent_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "sort_order",
                sa.Integer(),
                server_default="0",
                nullable=False,
            )
        )
        batch_op.alter_column(
            "datetime",
            existing_type=sa.DATETIME(),
            nullable=True,
        )
        batch_op.create_index(
            "idx_pages_card_type", ["card_type"], unique=False
        )
        batch_op.create_index(
            "idx_pages_parent_id", ["parent_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_pages_parent_id_pages",
            "pages",
            ["parent_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Downgrade schema.

    Reverse of upgrade(): drops the FK, indexes, and the three new
    columns; makes `datetime` NOT NULL again. Everything inside one
    batch block so SQLite handles the ALTER COLUMN by rebuilding
    the table.
    """
    with op.batch_alter_table("pages", schema=None) as batch_op:
        batch_op.drop_constraint(
            "fk_pages_parent_id_pages", type_="foreignkey"
        )
        batch_op.drop_index("idx_pages_parent_id")
        batch_op.drop_index("idx_pages_card_type")
        batch_op.alter_column(
            "datetime",
            existing_type=sa.DATETIME(),
            nullable=False,
        )
        batch_op.drop_column("sort_order")
        batch_op.drop_column("parent_id")
        batch_op.drop_column("card_type")