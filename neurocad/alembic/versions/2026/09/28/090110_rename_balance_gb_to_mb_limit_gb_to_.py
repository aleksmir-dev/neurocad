"""rename balance.gb → mb, limit_gb → limit_mb; add FK pages.nav_id → nav.id

Revision ID: 5dd8eb1eb253
Revises: 1cf4571248b4
Create Date: 2026-09-28 09:01:10.376974

Two schema alignments between the SQLAlchemy models and the live DB:

1. balance.gb / balance.limit_gb → balance.mb / balance.limit_mb
   Storage is now in megabytes; column names made explicit.
   No data conversion — old values were already "megabytes by
   convention", only the column name changes.

2. pages.nav_id → nav.id foreign key.
   Page.nav_id declares ForeignKey("nav.id") in the model, but
   the live DB was created before that FK was added, so the
   constraint is missing. Alembic re-detects it on every
   autogenerate run — we fix it here so it stops coming back.

   pages.template_id → pages.id already exists in the DB (checked
   via PRAGMA foreign_key_list(pages)), so it is NOT touched.

SQLite does not support ALTER TABLE ... ADD CONSTRAINT, and older
SQLite (< 3.25) does not support RENAME COLUMN either. Both fixes
go through op.batch_alter_table(), which recreates the table via
a temporary one and copies the data — safe on any SQLite version
and on Python 3.10+.

Foreign key naming:
    Explicit names are used (fk_pages_nav_id) because
    batch_alter_table needs a stable name to create the constraint
    and to drop it in downgrade. This follows SQLAlchemy's default
    convention fk_<table>_<column>.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "5dd8eb1eb253"
down_revision: Union[str, Sequence[str], None] = "1cf4571248b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Explicit constraint names — SQLite's ALTER path needs them.
FK_PAGES_NAV_ID = "fk_pages_nav_id"


def upgrade() -> None:
    """Apply both schema alignments."""

    # ============================================================
    # 1. balance.gb → balance.mb
    #    balance.limit_gb → balance.limit_mb
    #
    #    batch_alter_table recreates the table via a temp one —
    #    works on any SQLite version, any Python 3.10+.
    #    Data is preserved.
    # ============================================================
    with op.batch_alter_table("balance") as batch_op:
        batch_op.alter_column("gb", new_column_name="mb")
        batch_op.alter_column("limit_gb", new_column_name="limit_mb")

    # ============================================================
    # 2. pages.nav_id → nav.id
    #
    #    Model has ForeignKey("nav.id"); DB does not. Recreate
    #    `pages` with the constraint in place. template_id FK is
    #    already present — not touched.
    # ============================================================
    with op.batch_alter_table("pages") as batch_op:
        batch_op.create_foreign_key(
            FK_PAGES_NAV_ID,
            "nav",
            ["nav_id"],
            ["id"],
        )


def downgrade() -> None:
    """Revert both schema alignments."""

    # 2. Drop pages.nav_id → nav.id.
    with op.batch_alter_table("pages") as batch_op:
        batch_op.drop_constraint(FK_PAGES_NAV_ID, type_="foreignkey")

    # 1. Rename back.
    with op.batch_alter_table("balance") as batch_op:
        batch_op.alter_column("mb", new_column_name="gb")
        batch_op.alter_column("limit_mb", new_column_name="limit_gb")