"""rename genday to gen, drop genmon, add acc_at

Revision ID: 6b80633ef790
Revises: 5dd8eb1eb253
Create Date: 2026-09-29 02:52:04.622489

Renames and drops columns on `balance`:

    genday  → gen        (rename, data preserved)
    genmon  → (dropped)
    acc_at  → (new, nullable Date)

SQLite does not support ALTER TABLE ... RENAME COLUMN on all
versions, and cannot add a NOT NULL column without a default.
Both issues are handled by op.batch_alter_table(), which recreates
the table via a temporary one and copies the data — safe on any
SQLite version and on Python 3.10+.

No data conversion is needed: genday values map 1:1 to gen.
genmon is dropped — its values are discarded.
acc_at starts as NULL for all existing rows.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "6b80633ef790"
down_revision: Union[str, Sequence[str], None] = "5dd8eb1eb253"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename genday → gen, drop genmon, add acc_at."""
    with op.batch_alter_table("balance") as batch_op:
        # Rename — data preserved
        batch_op.alter_column("genday", new_column_name="gen")

        # Drop — values are discarded
        batch_op.drop_column("genmon")

        # Add — nullable Date, NULL for all existing rows
        batch_op.add_column(sa.Column("acc_at", sa.Date(), nullable=True))


def downgrade() -> None:
    """Rename gen → genday, restore genmon, drop acc_at."""
    with op.batch_alter_table("balance") as batch_op:
        # Drop acc_at
        batch_op.drop_column("acc_at")

        # Restore genmon — NOT NULL with default 0, safe for existing rows
        batch_op.add_column(
            sa.Column("genmon", sa.Integer(), nullable=False, server_default="0")
        )

        # Rename back
        batch_op.alter_column("gen", new_column_name="genday")