# neurocad/utils/static.py

import mimetypes
import shutil
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from .paths import (
    package_engine_dir,
    package_static_dir,
    user_engine_dir,
    user_static_dir,
)


# ============================================
# MIME TYPES (Windows fix)
# ============================================
# Windows: mimetypes.guess_type(".js") returns ("text/plain", None),
# so browsers refuse to execute ES modules
# (strict MIME type checking for <script type="module">).
# Register explicitly BEFORE creating StaticFiles, because Starlette
# caches MIME types at init time.

mimetypes.init()

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

# Static extensions to sync.
STATIC_EXTENSIONS = {
    '.css', '.js', '.mjs',
    '.woff2', '.woff', '.ttf',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.map',
}


def get_static_version() -> str:
    return STATIC_VERSION


def _sync_dir(src_dir: Path, dst_root: Path, dst_subdir: Path) -> tuple[int, int]:
    """
    Copy static files from src_dir to dst_root / dst_subdir.

    Copies only changed files (by mtime).

    Args:
        src_dir:    source directory (e.g. neurocad/core/engine/)
        dst_root:   destination root (e.g. project1/static/)
        dst_subdir: subpath inside dst_root (e.g. core/engine/)

    Returns:
        (copied, skipped)
    """
    if not src_dir.exists():
        return 0, 0

    copied = 0
    skipped = 0

    for filepath in src_dir.rglob('*'):
        if not filepath.is_file():
            continue

        if filepath.suffix not in STATIC_EXTENSIONS:
            continue

        rel_path = filepath.relative_to(src_dir)
        dest_path = dst_root / dst_subdir / rel_path

        if dest_path.exists() and filepath.stat().st_mtime <= dest_path.stat().st_mtime:
            skipped += 1
            continue

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(filepath, dest_path)
        copied += 1

    return copied, skipped


def sync_static() -> tuple[int, int]:
    """
    Sync static files to USER static dir (project1/static/).

    Order (later overwrites earlier, by mtime):
      1. Package libs/ + fonts/ -> project1/static/
      2. Package engine         -> project1/static/core/engine/
      3. User engine overrides  -> project1/static/core/engine/

    Returns total (copied, skipped).
    """
    static_root = user_static_dir()
    engine_subdir = Path("core") / "engine"

    copied_total = 0
    skipped_total = 0

    # 1. Package libs/ + fonts/ -> project1/static/
    c, s = _sync_dir(package_static_dir(), static_root, Path("."))
    copied_total += c
    skipped_total += s

    # 2. Package engine -> project1/static/core/engine/
    c, s = _sync_dir(package_engine_dir(), static_root, engine_subdir)
    copied_total += c
    skipped_total += s

    # 3. User engine -> project1/static/core/engine/ (overrides)
    c, s = _sync_dir(user_engine_dir(), static_root, engine_subdir)
    copied_total += c
    skipped_total += s

    return copied_total, skipped_total


def setup_static(app: FastAPI, log=None) -> None:
    """
    Mount /static and /media.

    log — optional logger with log_info_sync(target, message).
    If not provided — prints to stdout.
    """
    static_root = user_static_dir()
    static_root.mkdir(parents=True, exist_ok=True)

    # Media dir is relative to cwd: <project>/media/
    media_root = Path("media")
    media_root.mkdir(parents=True, exist_ok=True)

    copied, skipped = sync_static()

    if log:
        log.log_info_sync(
            target="static",
            message=f"Sync: copied={copied}, skipped={skipped}",
        )
    else:
        print(f"[Static] Sync: copied={copied}, skipped={skipped}")

    app.mount("/static", StaticFiles(directory=str(static_root)), name="static")
    app.mount("/media", StaticFiles(directory=str(media_root)), name="media")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon_redirect():
        return RedirectResponse(url="/static/core/engine/lib/base/images/favicon.ico")