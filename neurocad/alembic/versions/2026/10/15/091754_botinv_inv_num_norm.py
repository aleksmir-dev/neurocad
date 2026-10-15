"""botinv inv_num_norm

Revision ID: 15be507934bc
Revises: f18019200097
Create Date: 2026-10-15 09:17:54.049559

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "15be507934bc"
down_revision: Union[str, Sequence[str], None] = "f18019200097"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Adds botinv_items.inv_num_norm — an UPPER() version of inv_num,
    used for case-insensitive lookups. The unique constraint is
    moved from (sheet_id, inv_num) to (sheet_id, inv_num_norm).

    Two SQLite specifics handled here:

    1. `add_column(..., nullable=False)` on a non-empty table
       requires a server_default, otherwise SQLite refuses. Since
       the old sheet is being soft-deleted anyway, we simply wipe
       botinv_items first — that makes the column addition trivial
       and removes the need for a DEFAULT that we would never be
       able to drop (SQLite has no DROP DEFAULT).

    2. SQLite does not support DROP CONSTRAINT or ADD CONSTRAINT
       directly. Alembic's `batch_alter_table` handles it by
       recreating the table — that is the standard workaround for
       SQLite.

    Order of operations matters:
      - wipe items first (step 1 of the batch is a table rebuild);
      - inside the batch: drop old unique, add new column, then
        add the new unique. The new unique references the new
        column, so the column must exist by then.
    """

    # 1. The old sheet is being soft-deleted anyway — its items
    #    carry no value. Wiping them makes the NOT NULL column
    #    addition possible without a server_default.
    op.execute("DELETE FROM botinv_items")

    # 2. Rebuild the table (SQLite cannot ALTER constraints).
    with op.batch_alter_table("botinv_items", schema=None) as batch_op:
        batch_op.drop_constraint(
            "uq_botinv_sheet_invnum", type_="unique"
        )
        batch_op.add_column(
            sa.Column(
                "inv_num_norm",
                sa.String(length=64),
                nullable=False,
            )
        )
        batch_op.create_unique_constraint(
            "uq_botinv_sheet_invnum_norm",
            ["sheet_id", "inv_num_norm"],
        )

    # 3. Index for lookups (created outside the batch — it is not
    #    affected by the table rebuild in a harmful way, and
    #    keeping it separate matches the auto-generated layout).
    op.create_index(
        "idx_botinv_items_inv_num_norm",
        "botinv_items",
        ["inv_num_norm"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema.

    Reverses the upgrade. The DELETE that ran on upgrade is not
    undone — the data is gone and the intent was to discard it.
    Only the schema is reverted.
    """
    # 1. Drop the new index.
    op.drop_index("idx_botinv_items_inv_num_norm", table_name="botinv_items")

    # 2. Rebuild the table back to the old shape.
    with op.batch_alter_table("botinv_items", schema=None) as batch_op:
        batch_op.drop_constraint(
            "uq_botinv_sheet_invnum_norm", type_="unique"
        )
        batch_op.drop_column("inv_num_norm")
        batch_op.create_unique_constraint(
            "uq_botinv_sheet_invnum",
            ["sheet_id", "inv_num"],
        )