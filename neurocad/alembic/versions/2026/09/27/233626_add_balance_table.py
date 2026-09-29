"""add balance table

Revision ID: 1cf4571248b4
Revises: dcccfce2b645
Create Date: 2026-09-27 23:36:26.768129

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "1cf4571248b4"
down_revision: Union[str, Sequence[str], None] = "dcccfce2b645"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "balance",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tarif", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=True),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("genday", sa.Integer(), nullable=False),
        sa.Column("genmon", sa.Integer(), nullable=False),
        sa.Column("sum", sa.Integer(), nullable=False),
        sa.Column("gb", sa.Integer(), nullable=False),
        sa.Column("pages", sa.Integer(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("refer_id", sa.Integer(), nullable=True),
        sa.Column("limit_genday", sa.Integer(), nullable=False),
        sa.Column("limit_genmon", sa.Integer(), nullable=False),
        sa.Column("limit_gb", sa.Integer(), nullable=False),
        sa.Column("limit_pages", sa.Integer(), nullable=False),
        sa.Column("limit_tokens", sa.Integer(), nullable=False),
        sa.Column("is_delete", sa.Boolean(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["refer_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_balance_is_delete", "balance", ["is_delete"], unique=False
    )
    op.create_index(
        "idx_balance_refer_id", "balance", ["refer_id"], unique=False
    )
    op.create_index("idx_balance_tarif", "balance", ["tarif"], unique=False)
    op.create_index(
        "idx_balance_user_id", "balance", ["user_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_balance_user_id", table_name="balance")
    op.drop_index("idx_balance_tarif", table_name="balance")
    op.drop_index("idx_balance_refer_id", table_name="balance")
    op.drop_index("idx_balance_is_delete", table_name="balance")
    op.drop_table("balance")