# neurocad/utils/migrations.py

"""Применение Alembic-миграций из пакета."""

import logging
from alembic.config import Config
from alembic import command

from .paths import package_alembic_dir, package_alembic_ini

logger = logging.getLogger(__name__)


def apply_migrations(sync_url: str | None = None):
    """
    Применяет Alembic-миграции из пакета.

    sync_url — если задан, переопределяет sqlalchemy.url из alembic.ini.
    """
    from ..config import settings

    ini_path = package_alembic_ini()
    if not ini_path.exists():
        raise RuntimeError(f"alembic.ini не найден в пакете: {ini_path}")

    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(package_alembic_dir()))
    cfg.set_main_option("sqlalchemy.url", sync_url or settings.SQLITE_URL_SYNC)

    logger.info("Применяю Alembic-миграции...")
    command.upgrade(cfg, "head")
    logger.info("Миграции применены.")
