"""domains.delete_after nullable

Revision ID: 604829e9a9f7
Revises: 8d7a5c96eb43
Create Date: 2026-10-02 09:08:39.634770

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "604829e9a9f7"
down_revision: Union[str, Sequence[str], None] = "8d7a5c96eb43"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: make delete_after nullable."""
    with op.batch_alter_table("domains", recreate="always") as batch_op:
        batch_op.alter_column(
            "delete_after",
            existing_type=sa.DateTime(),
            nullable=True,
        )


def downgrade() -> None:
    """Downgrade schema: restore NOT NULL on delete_after."""
    with op.batch_alter_table("domains", recreate="always") as batch_op:
        batch_op.alter_column(
            "delete_after",
            existing_type=sa.DateTime(),
            nullable=False,
        )