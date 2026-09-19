# neurocad/alembic/env.py

import os
from logging.config import fileConfig
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context
from alembic.script import ScriptDirectory as OriginalScriptDirectory
import sqlalchemy as sa
from neurocad.core.models.base import Base
from neurocad.config import settings

# ============================================
# ALEMBIC CONFIG
# ============================================

# Don't override sqlalchemy.url if already set by migrations.py
db_url = settings.SQLITE_URL_SYNC
config = context.config
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", db_url)


# ============================================
# LOGGING
# ============================================

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# ============================================
# MODEL METADATA
# ============================================

target_metadata = Base.metadata


# ============================================
# PATCH: AUTO-CREATE NESTED FOLDERS
# ============================================

_orig_rev_path = OriginalScriptDirectory._rev_path


def _rev_path_hook(self, version_path, revid, message, create_date, head=None, *args, **kwargs):
    full_path = _orig_rev_path(self, version_path, revid, message, create_date)
    dir_path = os.path.dirname(full_path)
    os.makedirs(dir_path, exist_ok=True)
    return full_path


OriginalScriptDirectory._rev_path = _rev_path_hook


# ============================================
# PROCESS REVISION DIRECTIVES
# ============================================

def process_revision_directives(context, revision, directives):
    """Add server_default for Boolean NOT NULL columns in SQLite."""
    if context.dialect.name != 'sqlite':
        return

    for directive in directives:
        if hasattr(directive, 'upgrade_ops') and directive.upgrade_ops:
            for op in directive.upgrade_ops.ops:
                # Handle add_column
                if hasattr(op, 'add_column') and hasattr(op, 'column'):
                    col = op.column
                    if isinstance(col, sa.Column) and isinstance(col.type, sa.Boolean):
                        if not col.nullable and col.server_default is None:
                            col.server_default = sa.text('0')

                # Handle create_table
                elif hasattr(op, 'create_table') and hasattr(op, 'columns'):
                    for col in op.columns:
                        if isinstance(col, sa.Column) and isinstance(col.type, sa.Boolean):
                            if not col.nullable and col.server_default is None:
                                col.server_default = sa.text('0')


# ============================================
# OFFLINE MODE
# ============================================

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        process_revision_directives=process_revision_directives,
    )
    with context.begin_transaction():
        context.run_migrations()


# ============================================
# ONLINE MODE (SYNC)
# ============================================

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            process_revision_directives=process_revision_directives,
        )
        with context.begin_transaction():
            context.run_migrations()


# ============================================
# ENTRY POINT
# ============================================

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()