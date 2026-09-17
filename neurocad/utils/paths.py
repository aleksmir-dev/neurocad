# neurocad/utils/paths.py

"""Работа с путями пакета и рабочей директории пользователя."""

from pathlib import Path
from importlib.resources import files


def package_dir() -> Path:
    """Корень пакета neurocad (в site-packages)."""
    return Path(str(files("neurocad")))


def package_alembic_dir() -> Path:
    return package_dir() / "alembic"


def package_alembic_ini() -> Path:
    return package_dir() / "alembic.ini"


def package_templates_dir() -> Path:
    return package_dir() / "templates"


def package_static_dir() -> Path:
    return package_dir() / "static"


def ensure_workdirs():
    """Создаёт рабочие директории в cwd, если их нет."""
    from ..config import settings

    for p in [
        settings.BASE_PATH,
        settings.LOG_PATH,
        settings.MEDIA_PATH,
        settings.STATIC_PATH,
        Path("templates"),
        Path("app"),
    ]:
        Path(p).mkdir(parents=True, exist_ok=True)
