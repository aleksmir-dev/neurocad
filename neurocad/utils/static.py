# neurocad/utils/static.py

import mimetypes
import shutil
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from ..config import settings


# ============================================
# MIME-ТИПЫ (фикс для Windows)
# ============================================
# Windows: mimetypes.guess_type(".js") возвращает ("text/plain", None),
# из-за чего браузер отказывается выполнять ES-модули
# (strict MIME type checking для <script type="module">).
# Регистрируем явно — ДО создания StaticFiles, потому что Starlette
# кеширует MIME-типы на момент инициализации.

# Инициализируем стандартные типы ОС (на случай, если не подгружены)
mimetypes.init()

# Перебиваем / дополняем критичные типы
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("image/x-icon", ".ico")
mimetypes.add_type("image/vnd.microsoft.icon", ".ico")


STATIC_VERSION = str(int(time.time()))

APP_DIR = Path(__file__).parent.parent
CORE_DIR = APP_DIR / "core"
STATIC_DIR = APP_DIR / "static"
MEDIA_DIR = APP_DIR.parent / "media"


def get_static_version() -> str:
    return STATIC_VERSION


def sync_static():
    """
    Синхронизация статики из core/ в static/.
    Копирует только изменённые файлы (по mtime).
    """
    extensions = {'.css', '.js', '.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.map'}

    if not CORE_DIR.exists():
        return 0, 0

    copied = 0
    skipped = 0

    for filepath in CORE_DIR.rglob('*'):
        if not filepath.is_file():
            continue

        if filepath.suffix not in extensions:
            continue

        rel_path = filepath.relative_to(APP_DIR)
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
    Монтирует /static и /media.

    log — опциональный логгер с методом log_info_sync(target, message).
    Если не передан — печатает в stdout.
    """
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    # Всегда синхронизируем — копируются только изменённые файлы
    copied, skipped = sync_static()

    if log:
        log.log_info_sync(
            target="static",
            message=f"Sync: copied={copied}, skipped={skipped}",
        )
    else:
        print(f"[Static] Sync: copied={copied}, skipped={skipped}")

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon_redirect():
        return RedirectResponse(url="/static/core/base/images/favicon.ico")