"""add llm settings table

Revision ID: 4f41c40a18ab
Revises: f84188c16e8f
Create Date: 2026-09-23 04:57:42.635260

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f41c40a18ab'
down_revision: Union[str, Sequence[str], None] = 'f84188c16e8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    dialect = bind.dialect.name

    # ==================================================================
    # 1. Create the new "llm" table
    # ==================================================================
    op.create_table(
        'llm',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('model', sa.String(length=64), nullable=True),
        sa.Column('max_output_tokens', sa.Integer(), nullable=True),
        sa.Column('timeout', sa.Integer(), nullable=True),
        sa.Column('deepseek_api_key_enc', sa.LargeBinary(), nullable=True),
        sa.Column('openai_api_key_enc', sa.LargeBinary(), nullable=True),
        sa.Column('yandex_api_key_enc', sa.LargeBinary(), nullable=True),
        sa.Column('yandex_folder_id_enc', sa.LargeBinary(), nullable=True),
        sa.Column('gigachat_auth_key_enc', sa.LargeBinary(), nullable=True),
        sa.Column('gigachat_ca_pem_enc', sa.LargeBinary(), nullable=True),
        sa.Column('gemini_api_key_enc', sa.LargeBinary(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # Initial row: default provider is DeepSeek.
    op.execute("INSERT INTO llm (id, provider) VALUES (1, 'deepseek')")

    # ==================================================================
    # 2. Add the missing FK on pages.template_id
    #
    # SQLite does not support ALTER TABLE ADD CONSTRAINT. batch_alter_table
    # rebuilds the table:
    #   a. creates a new table with the same columns + the FK
    #   b. copies the existing data
    #   c. drops the old table
    #   d. renames the new table to "pages"
    #
    # PRAGMA foreign_keys must be OFF during the rebuild, otherwise
    # SQLite refuses to drop the old table (it still has referencing rows).
    # We toggle it inside the migration so we don't depend on env.py.
    # ==================================================================
    if dialect == "sqlite":
        op.execute("PRAGMA foreign_keys=OFF")

    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_pages_template_id',
            'pages',
            ['template_id'],
            ['id'],
        )

    if dialect == "sqlite":
        op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute("PRAGMA foreign_keys=OFF")

    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.drop_constraint('fk_pages_template_id', type_='foreignkey')

    if dialect == "sqlite":
        op.execute("PRAGMA foreign_keys=ON")

    op.drop_table('llm')