# app/utils/static.py

import shutil
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from ..config import settings

STATIC_VERSION = str(int(time.time()))

APP_DIR = Path(__file__).parent.parent
CORE_DIR = APP_DIR / "core"
STATIC_DIR = APP_DIR / "static"
DOWNLOAD_DIR = APP_DIR.parent / "download"


def get_static_version() -> str:
    return STATIC_VERSION


def sync_static():
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


def setup_static(app: FastAPI) -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    if settings.DEBUG:
        sync_static()
    else:
        if not any(STATIC_DIR.iterdir()):
            sync_static()
    
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/download", StaticFiles(directory=str(DOWNLOAD_DIR)), name="download")