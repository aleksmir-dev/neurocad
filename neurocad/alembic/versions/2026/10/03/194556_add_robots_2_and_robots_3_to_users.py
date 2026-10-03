"""add robots_2 and robots_3 to users

Revision ID: b34d42853cc7
Revises: 266ca9567723
Create Date: 2026-10-03 19:45:56.434847

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b34d42853cc7"
down_revision: Union[str, Sequence[str], None] = "266ca9567723"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# --------------------------------------------------------------------------
# SQLite workaround for ALTER TABLE.
#
# SQLite does not support ALTER TABLE ... ADD COLUMN with the same
# guarantees as Postgres, and more importantly — this project's
# SQLite engine is created by SQLAlchemy, and in older SQLite builds
# `op.add_column` on a table with existing indexes / foreign keys
# fails with "Cannot add a column with non-constant default" or
# "near ... syntax error" depending on the SQLAlchemy / SQLite
# version pair. Even when the raw statement works, Alembic's
# renderer sometimes emits it in a form SQLite refuses.
#
# The portable approach for SQLite is the standard "12-step" recipe:
#
#   1. create a new table with the target schema,
#   2. copy the data over,
#   3. drop the old table,
#   4. rename the new table to the old name,
#   5. recreate indexes.
#
# `op.batch_alter_table` implements exactly this recipe and is the
# recommended way to alter SQLite tables through Alembic. It runs
# the same code on every backend — on Postgres it falls back to
# plain ALTER TABLE, on SQLite it does the copy-and-rename dance.
#
# `recreate="always"` forces the batch path even when Alembic thinks
# plain ALTER would work — this makes the behaviour identical across
# environments and avoids the SQLite-specific "works in dev, breaks
# in prod" class of bugs.
# --------------------------------------------------------------------------


def upgrade() -> None:
    """Add robots_2 and robots_3 (both TEXT, nullable) to users."""
    with op.batch_alter_table("users", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("robots_3", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("robots_2", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop robots_2 and robots_3 from users."""
    with op.batch_alter_table("users", recreate="always") as batch_op:
        batch_op.drop_column("robots_2")
        batch_op.drop_column("robots_3")