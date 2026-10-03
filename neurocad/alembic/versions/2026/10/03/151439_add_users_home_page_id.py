"""add users.home_page_id

Revision ID: 266ca9567723
Revises: 604829e9a9f7
Create Date: 2026-10-03 15:14:39.582786

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "266ca9567723"
down_revision: Union[str, Sequence[str], None] = "604829e9a9f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Explicit constraint name so downgrade() can find it reliably,
# and so PostgreSQL does not choke on drop_constraint(None, ...).
FK_NAME = op.f("fk_users_home_page_id")


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite does not support ALTER TABLE ... ADD CONSTRAINT.
    # batch_alter_table() rebuilds the table behind the scenes
    # (shadow table, copy, swap), which is the only portable way
    # to add a foreign key to an existing SQLite table.
    #
    # On PostgreSQL, batch_alter_table() degrades to plain
    # ALTER TABLE — same SQL you would write by hand.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("home_page_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            FK_NAME,
            "pages",
            ["home_page_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint(FK_NAME, type_="foreignkey")
        batch_op.drop_column("home_page_id")