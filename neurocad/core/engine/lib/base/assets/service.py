# neurocad/core/engine/lib/base/assets/service.py

"""
Media library service for the base component.

Storage layout:
    media/<mod_id>/<filename>

Public URL:
    /media/<mod_id>/<filename>

Special filenames (kept as-is, no random suffix):
    favicon.ico, robots.txt, sitemap.xml

Regular files get an 8-hex random suffix to avoid collisions:
    photo.png  →  photo_a1b2c3d4.png

Only image extensions are listed:
    .jpg, .jpeg, .png, .gif, .svg, .webp

Namespace: CoreEngineLibBaseAssetsService
"""

import os
import re
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import UploadFile

from .schema import CoreEngineLibBaseAssetsItem
from ..module.service import get_module_name_by_id


# ============================================
# CONSTANTS
# ============================================

# Public URL prefix for media files.
MEDIA_URL = "/media"

# Root directory for all media (relative to cwd).
MEDIA_ROOT = Path("media")

# Filenames kept as-is (no random suffix).
# These live in the module root — favicon, robots, sitemap.
SPECIAL_NAMES = {"favicon.ico", "robots.txt", "sitemap.xml"}

# Allowed image extensions (case-insensitive).
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"}


# ============================================
# SERVICE
# ============================================

class CoreEngineLibBaseAssetsService:
    """Media library for a single module (by mod_id)."""

    # ----------------------------------------
    # PATHS
    # ----------------------------------------

    @staticmethod
    def _module_dir(mod_id: int) -> Path:
        """
        Return the media directory for a module:
            media/<mod_id>/

        Creates the directory if it does not exist.
        """
        media_dir = MEDIA_ROOT / str(mod_id)
        media_dir.mkdir(parents=True, exist_ok=True)
        return media_dir

    # ----------------------------------------
    # LIST ASSETS
    # ----------------------------------------

    @staticmethod
    async def list_assets(mod_id: int) -> List[Dict[str, str]]:
        """
        List all image files in media/<mod_id>/ (recursive).

        Returns list of dicts: { src, name, type }.
        """
        media_dir = CoreEngineLibBaseAssetsService._module_dir(mod_id)
        assets: List[Dict[str, str]] = []

        for filepath in sorted(media_dir.rglob("*")):
            if not filepath.is_file():
                continue

            ext = filepath.suffix.lower()
            if ext not in IMAGE_EXTENSIONS:
                continue

            rel = filepath.relative_to(media_dir).as_posix()

            assets.append({
                "src": f"{MEDIA_URL}/{mod_id}/{rel}",
                "name": filepath.name,
                "type": "image",
            })

        return assets

    # ----------------------------------------
    # UPLOAD ASSETS
    # ----------------------------------------

    @staticmethod
    async def upload_assets(
        files: List[UploadFile],
        mod_id: int,
    ) -> List[Dict[str, str]]:
        """
        Save uploaded files to media/<mod_id>/.

        Special names (favicon.ico, robots.txt, sitemap.xml) are kept as-is.
        Other files get an 8-hex random suffix to avoid collisions.

        Returns list of dicts: { src, name, type }.
        """
        media_dir = CoreEngineLibBaseAssetsService._module_dir(mod_id)
        uploaded: List[Dict[str, str]] = []

        for uploaded_file in files:
            original_name = uploaded_file.filename or "file"
            clean_name = re.sub(r"[^a-zA-Z0-9_.\-]", "_", original_name)

            if clean_name in SPECIAL_NAMES:
                final_name = clean_name
            else:
                name, ext = os.path.splitext(clean_name)
                suffix = uuid.uuid4().hex[:8]
                final_name = f"{name}_{suffix}{ext}"

            save_path = media_dir / final_name

            with open(save_path, "wb") as buffer:
                while True:
                    chunk = await uploaded_file.read(1024 * 64)
                    if not chunk:
                        break
                    buffer.write(chunk)

            await uploaded_file.close()

            uploaded.append({
                "src": f"{MEDIA_URL}/{mod_id}/{final_name}",
                "name": final_name,
                "type": "image",
            })

        return uploaded

    # ----------------------------------------
    # DELETE ASSET
    # ----------------------------------------

    @staticmethod
    async def delete_asset(
        filename: str,
        mod_id: int,
    ) -> bool:
        """
        Delete a single file from media/<mod_id>/.

        Protects against path traversal:
          - basename() — strips any directory part
          - rejects names starting with '.' (hidden files)
          - rejects if file does not exist

        Returns True if the file was deleted, False otherwise.
        """
        # Sanitize: only the basename is allowed.
        safe_name = os.path.basename(filename)
        if not safe_name or safe_name.startswith("."):
            return False

        media_dir = CoreEngineLibBaseAssetsService._module_dir(mod_id)
        file_path = media_dir / safe_name

        # Final safety check: resolved path must stay inside media_dir.
        try:
            file_path.resolve().relative_to(media_dir.resolve())
        except ValueError:
            return False

        if not file_path.is_file():
            return False

        try:
            file_path.unlink()
            return True
        except Exception as e:
            print(f"[BaseAssets] delete_asset failed: {e}")
            return False