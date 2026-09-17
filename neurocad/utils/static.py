# neurocad/utils/static.py

import shutil
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from ..config import settings


STATIC_VERSION = str(int(time.time()))

# Внутри пакета neurocad/
NEUROCAD_DIR = Path(__file__).parent.parent

# Исходники статики — в core/
CORE_DIR = NEUROCAD_DIR / "core"

# Собранная статика ядра — в static/ пакета
STATIC_DIR = NEUROCAD_DIR / "static"


def get_static_version() -> str:
    return STATIC_VERSION


def sync_static() -> tuple[int, int]:
    """
    Синхронизация статики из core/ в static/ (внутри пакета).
    Копирует только изменённые файлы (по mtime).

    Возвращает (copied, skipped).
    """
    extensions = {
        '.css', '.js', '.woff2', '.woff', '.ttf',
        '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.map',
    }

    if not CORE_DIR.exists():
        return 0, 0

    copied = 0
    skipped = 0

    for filepath in CORE_DIR.rglob('*'):
        if not filepath.is_file():
            continue

        if filepath.suffix not in extensions:
            continue

        rel_path = filepath.relative_to(NEUROCAD_DIR)
        dest_path = STATIC_DIR / rel_path

        if dest_path.exists() and filepath.stat().st_mtime <= dest_path.stat().st_mtime:
            skipped += 1
            continue

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(filepath, dest_path)
        copied += 1

    return copied, skipped


def setup_static(app: FastAPI, log=None) -> None:
    """
    Монтирует статику и media.

    Статика ядра — из пакета (neurocad/static/).
    Media — из проекта (config.MEDIA_PATH).
    """
    # 1. Собираем статику ядра (только изменённые файлы)
    copied, skipped = sync_static()

    if log:
        log.log_info_sync(
            target="static",
            message=f"Sync: copied={copied}, skipped={skipped}",
        )

    # 2. Создаём папки
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    media_dir = Path(settings.MEDIA_PATH)
    media_dir.mkdir(parents=True, exist_ok=True)

    # 3. Монтируем
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/media", StaticFiles(directory=str(media_dir)), name="media")

    # 4. Favicon
    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon_redirect():
        return RedirectResponse(url="/static/core/engine/lib/base/images/favicon.ico")