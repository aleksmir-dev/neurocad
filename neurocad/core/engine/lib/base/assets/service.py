# neurocad/core/engine/lib/base/assets/service.py

"""
Media library service for the base component.

Storage layout:
    media/<nav_id>/<filename>

Public URL:
    /media/<nav_id>/<filename>

A nav is the object that owns pages and media. Media is isolated per
nav instance, not per module — this matches the storage layout used
by the word editor (see word/service.py).

Special filenames (kept as-is, no random suffix):
    favicon.ico, robots.txt, sitemap.xml

Regular files get an 8-hex random suffix to avoid collisions:
    photo.png  →  photo_a1b2c3d4.png

Only image extensions are listed:
    .jpg, .jpeg, .png, .gif, .svg, .webp

Tariff check:
    Before saving, BalanceChecked.media_allowed(user_id, extra_mb)
    is called. If the user would exceed limit_mb, HTTP 403 is raised.
    After a successful upload, bal.mb is incremented; after a delete,
    decremented.

Namespace: CoreEngineLibBaseAssetsService
"""

import os
import re
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select

from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.balance import Balance
from neurocad.core.models.nav import Nav
from neurocad.core.engine.lib.balance.checked import BalanceChecked
from .schema import CoreEngineLibBaseAssetsItem


# ============================================
# CONSTANTS
# ============================================

# Public URL prefix for media files.
MEDIA_URL = "/media"

# Root directory for all media (relative to cwd).
MEDIA_ROOT = Path("media")

# Filenames kept as-is (no random suffix).
# These live in the nav root — favicon, robots, sitemap.
SPECIAL_NAMES = {"favicon.ico", "robots.txt", "sitemap.xml"}

# Allowed image extensions (case-insensitive).
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"}


# ============================================
# SERVICE
# ============================================

class CoreEngineLibBaseAssetsService:
    """Media library for a single nav instance (by nav_id)."""

    # ----------------------------------------
    # LOG HELPER
    # ----------------------------------------

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="assets", message=message)
        except Exception:
            pass

    # ----------------------------------------
    # PATHS
    # ----------------------------------------

    @staticmethod
    def _nav_dir(nav_id: int) -> Path:
        """
        Return the media directory for a nav instance:
            media/<nav_id>/

        Creates the directory if it does not exist.
        """
        media_dir = MEDIA_ROOT / str(nav_id)
        media_dir.mkdir(parents=True, exist_ok=True)
        return media_dir

    # ----------------------------------------
    # LIST ASSETS
    # ----------------------------------------

    @staticmethod
    async def list_assets(nav_id: int) -> List[Dict[str, str]]:
        """
        List all image files in media/<nav_id>/ (recursive).

        Returns list of dicts: { src, name, type }.
        """
        media_dir = CoreEngineLibBaseAssetsService._nav_dir(nav_id)
        assets: List[Dict[str, str]] = []

        for filepath in sorted(media_dir.rglob("*")):
            if not filepath.is_file():
                continue

            ext = filepath.suffix.lower()
            if ext not in IMAGE_EXTENSIONS:
                continue

            rel = filepath.relative_to(media_dir).as_posix()

            assets.append({
                "src": f"{MEDIA_URL}/{nav_id}/{rel}",
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
        nav_id: int,
        log=None,
    ) -> List[Dict[str, str]]:
        """
        Save uploaded files to media/<nav_id>/.

        Before saving — checks the user's remaining storage via
        BalanceChecked.media_allowed(user_id, extra_mb). If the limit
        would be exceeded — raises HTTPException(403, detail='mb_exhausted').

        After a successful upload — increments bal.mb by the total
        size of the saved files.

        Special names (favicon.ico, robots.txt, sitemap.xml) are kept as-is.
        Other files get an 8-hex random suffix to avoid collisions.

        Returns list of dicts: { src, name, type }.
        """
        # ---- 1. Size of incoming files (in MB, rounded up) ----
        total_bytes = 0
        sizes_by_name: Dict[str, int] = {}

        for uploaded_file in files:
            # Read once into memory (files are small — media uploads).
            # We need the content anyway to write it.
            pass  # We'll re-read inside the write loop below; sizes computed there.

        # Because UploadFile can be read only once, we buffer all files here.
        buffered: List[Dict[str, Any]] = []
        for uploaded_file in files:
            try:
                data = await uploaded_file.read()
            except Exception as e:
                CoreEngineLibBaseAssetsService._log(
                    log, "error", f"read failed for {uploaded_file.filename}: {e}"
                )
                raise HTTPException(status_code=400, detail="Не удалось прочитать файл")

            original_name = uploaded_file.filename or "file"
            buffered.append({
                "original_name": original_name,
                "data": data,
                "size": len(data),
            })
            total_bytes += len(data)

            await uploaded_file.close()

        # Convert to MB (ceil).
        extra_mb = (total_bytes + (1024 * 1024) - 1) // (1024 * 1024)

        # ---- 2. Tariff check ----
        user_id = await CoreEngineLibBaseAssetsService._resolve_user_id(nav_id)
        if user_id is not None:
            bal, err = await BalanceChecked.media_allowed(
                user_id, extra_mb=extra_mb, log=log
            )
            if err:
                CoreEngineLibBaseAssetsService._log(
                    log, "info",
                    f"upload blocked for user {user_id}: {err} "
                    f"(mb={bal.mb if bal else '?'}, limit={bal.limit_mb if bal else '?'}, extra_mb={extra_mb})"
                )
                raise HTTPException(status_code=403, detail=err)

        # ---- 3. Write files ----
        media_dir = CoreEngineLibBaseAssetsService._nav_dir(nav_id)
        uploaded: List[Dict[str, str]] = []
        written_bytes = 0

        for item in buffered:
            original_name = item["original_name"]
            data = item["data"]

            clean_name = re.sub(r"[^a-zA-Z0-9_.\-]", "_", original_name)

            if clean_name in SPECIAL_NAMES:
                final_name = clean_name
            else:
                name, ext = os.path.splitext(clean_name)
                suffix = uuid.uuid4().hex[:8]
                final_name = f"{name}_{suffix}{ext}"

            save_path = media_dir / final_name

            try:
                with open(save_path, "wb") as buffer:
                    buffer.write(data)
            except Exception as e:
                CoreEngineLibBaseAssetsService._log(
                    log, "error", f"write failed for {final_name}: {e}"
                )
                raise HTTPException(status_code=500, detail="Не удалось сохранить файл")

            written_bytes += item["size"]

            uploaded.append({
                "src": f"{MEDIA_URL}/{nav_id}/{final_name}",
                "name": final_name,
                "type": "image",
            })

        # ---- 4. Update bal.mb ----
        if user_id is not None and written_bytes > 0:
            added_mb = (written_bytes + (1024 * 1024) - 1) // (1024 * 1024)
            await CoreEngineLibBaseAssetsService._add_mb(user_id, added_mb, log=log)

        return uploaded

    # ----------------------------------------
    # DELETE ASSET
    # ----------------------------------------

    @staticmethod
    async def delete_asset(
        filename: str,
        nav_id: int,
        log=None,
    ) -> bool:
        """
        Delete a single file from media/<nav_id>/.

        Protects against path traversal:
          - basename() — strips any directory part
          - rejects names starting with '.' (hidden files)
          - rejects if file does not exist

        After deletion — decrements bal.mb by the file's size (rounded
        up to the nearest MB; result is clamped at 0).

        Returns True if the file was deleted, False otherwise.
        """
        # Sanitize: only the basename is allowed.
        safe_name = os.path.basename(filename)
        if not safe_name or safe_name.startswith("."):
            return False

        media_dir = CoreEngineLibBaseAssetsService._nav_dir(nav_id)
        file_path = media_dir / safe_name

        # Final safety check: resolved path must stay inside media_dir.
        try:
            file_path.resolve().relative_to(media_dir.resolve())
        except ValueError:
            return False

        if not file_path.is_file():
            return False

        # Remember the size before deleting.
        try:
            size_bytes = file_path.stat().st_size
        except Exception:
            size_bytes = 0

        try:
            file_path.unlink()
        except Exception as e:
            CoreEngineLibBaseAssetsService._log(log, "error", f"delete failed: {e}")
            return False

        # ---- Update bal.mb (decrement) ----
        user_id = await CoreEngineLibBaseAssetsService._resolve_user_id(nav_id)
        if user_id is not None and size_bytes > 0:
            removed_mb = (size_bytes + (1024 * 1024) - 1) // (1024 * 1024)
            await CoreEngineLibBaseAssetsService._sub_mb(user_id, removed_mb, log=log)

        return True

    # ----------------------------------------
    # INTERNAL — NAV OWNER
    # ----------------------------------------

    @staticmethod
    async def _resolve_user_id(nav_id: int) -> Optional[int]:
        """Return the owner (user_id) of a nav, or None."""
        async for session in get_db_sqlite():
            stmt = select(Nav.user_id).where(
                Nav.id == nav_id,
                Nav.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
        return None

    # ----------------------------------------
    # INTERNAL — MB COUNTER
    # ----------------------------------------

    @staticmethod
    async def _add_mb(user_id: int, mb: int, log=None) -> None:
        """Add `mb` to the user's Balance.mb (clamped at 0)."""
        if mb <= 0:
            return
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(stmt)).scalar_one_or_none()
            if bal is None:
                return
            bal.mb = (bal.mb or 0) + mb
            await session.commit()
            CoreEngineLibBaseAssetsService._log(
                log, "info", f"mb += {mb} for user {user_id} (now {bal.mb})"
            )
            return

    @staticmethod
    async def _sub_mb(user_id: int, mb: int, log=None) -> None:
        """Subtract `mb` from the user's Balance.mb (clamped at 0)."""
        if mb <= 0:
            return
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(stmt)).scalar_one_or_none()
            if bal is None:
                return
            bal.mb = max(0, (bal.mb or 0) - mb)
            await session.commit()
            CoreEngineLibBaseAssetsService._log(
                log, "info", f"mb -= {mb} for user {user_id} (now {bal.mb})"
            )
            return