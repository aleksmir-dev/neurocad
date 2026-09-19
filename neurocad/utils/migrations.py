# neurocad/utils/migrations.py

"""Apply Alembic migrations from package and user directories."""

import logging
from pathlib import Path
from alembic.config import Config
from alembic import command

from .paths import (
    package_alembic_dir,
    package_alembic_ini,
    user_alembic_versions_dir,
)

logger = logging.getLogger(__name__)


def _collect_version_locations(root: Path) -> list[str]:
    """
    Recursively collect all directories containing .py migration files.

    Alembic's `recursive_version_locations` does not work reliably
    when version_locations is set programmatically, so we walk the tree
    ourselves and pass an explicit list of directories.

    Supports nested layouts like:
        versions/2026/09/19/011744_init.py
    """
    locations: list[str] = []
    if not root.exists():
        return locations

    for path in [root] + [p for p in root.rglob("*") if p.is_dir()]:
        if any(path.glob("*.py")):
            locations.append(str(path))

    return locations


def apply_migrations(sync_url: str | None = None):
    """
    Apply Alembic migrations.

    Migrations are loaded from two locations:
      1. Package: neurocad/alembic/versions/
      2. User:    <cwd>/alembic/versions/ (if exists)

    sync_url — optional, overrides sqlalchemy.url from alembic.ini.
    """
    from ..config import settings

    ini_path = package_alembic_ini()
    if not ini_path.exists():
        raise RuntimeError(f"alembic.ini not found in package: {ini_path}")

    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(package_alembic_dir()))
    cfg.set_main_option("sqlalchemy.url", sync_url or settings.SQLITE_URL_SYNC)

    # ===== Collect version_locations =====
    locations = _collect_version_locations(package_alembic_dir() / "versions")

    user_versions = user_alembic_versions_dir()
    if user_versions.exists() and user_versions.is_dir():
        user_locations = _collect_version_locations(user_versions)
        if user_locations:
            locations.extend(user_locations)
            logger.info(f"User migrations dirs: {user_locations}")

    if not locations:
        logger.warning("No migration directories found.")

    cfg.set_main_option("version_locations", " ".join(locations))

    logger.info("Applying Alembic migrations...")
    command.upgrade(cfg, "head")
    logger.info("Migrations applied.")