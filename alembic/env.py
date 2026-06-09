# alembic/env.py

import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, Boolean, Column
from alembic import context
from alembic.script import ScriptDirectory as OriginalScriptDirectory
import sqlalchemy as sa

# ────────────── Импорты моделей SQLite ──────────────
from app.core.node.models import Base

# ────────────── Конфигурация Alembic ──────────────
config = context.config

# Настройка логирования
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Метаданные моделей
target_metadata = Base.metadata

# ────────────── Патчим для автосоздания папок ──────────────
_orig_rev_path = OriginalScriptDirectory._rev_path

def _rev_path_hook(self, version_path, revid, message, create_date, head=None, *args, **kwargs):
    full_path = _orig_rev_path(self, version_path, revid, message, create_date)
    dir_path = os.path.dirname(full_path)
    os.makedirs(dir_path, exist_ok=True)
    return full_path

OriginalScriptDirectory._rev_path = _rev_path_hook

# ────────────── Функция для модификации колонок перед рендерингом ──────────────
def process_revision_directives(context, revision, directives):
    """Добавляет server_default для булевых NOT NULL колонок в SQLite"""
    if context.dialect.name != 'sqlite':
        return
    
    for directive in directives:
        if hasattr(directive, 'upgrade_ops') and directive.upgrade_ops:
            for op in directive.upgrade_ops.ops:
                # Обработка добавления колонки
                if hasattr(op, 'add_column') and hasattr(op, 'column'):
                    col = op.column
                    # Проверяем, что это колонка (Column), а не другой объект
                    if isinstance(col, sa.Column) and isinstance(col.type, sa.Boolean):
                        if not col.nullable and col.server_default is None:
                            col.server_default = sa.text('0')
                
                # Обработка создания таблицы
                elif hasattr(op, 'create_table') and hasattr(op, 'columns'):
                    for col in op.columns:
                        if isinstance(col, sa.Column) and isinstance(col.type, sa.Boolean):
                            if not col.nullable and col.server_default is None:
                                col.server_default = sa.text('0')

# ────────────── Offline режим ──────────────
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

# ────────────── Online режим (синхронный) ──────────────
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

# ────────────── Точка входа ──────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()