# neurocad/core/engine/lib/word/service.py

import os
import re
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import UploadFile

from sqlalchemy import select

from ....models.base import Page
from ....models.module import Module
from .....utils.sqlite import get_db_sqlite


# ============================================
# URLS
# ============================================

MEDIA_URL = "/media"

# Special filenames — kept as-is (no random suffix).
# Used for site root files: favicon.ico, robots.txt, sitemap.xml.
SPECIAL_NAMES = {"favicon.ico", "robots.txt", "sitemap.xml"}


class CoreEngineLibWordService:
    """Service for page content and assets."""

    # ========================================
    # PAGE BY DATETIME
    # ========================================

    @staticmethod
    async def get_by_datetime(
        date: str,
        time: str,
        mod_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Find page by date and time within a module.

        date = "20260914" (YYYYMMDD)
        time = "153910"   (HHMMSS)

        datetime in DB has microseconds (15:39:10.666406),
        so we search in range [dt_start, dt_start + 1 sec).
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError as e:
            print(f"[Word] Invalid date/time: {date} {time} — {e}")
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.mod_id == mod_id,
                Page.datetime >= dt_start,
                Page.datetime < dt_end,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            return _page_to_dict(page)

        return None

    # ========================================
    # PAGE BY ID
    # ========================================

    @staticmethod
    async def get_by_id(
        page_id: int,
        mod_id: int,
    ) -> Optional[Dict[str, Any]]:
        """Find page by ID within a module."""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.mod_id == mod_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            return _page_to_dict(page)

        return None

    # ========================================
    # SAVE CONTENT
    # ========================================

    @staticmethod
    async def save_content(
        page_id: int,
        mod_id: int,
        content: Optional[str],
        content_json: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Save page content.

        Updates content and content_json in Page model.
        Returns updated data or None if page not found.
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.mod_id == mod_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            if content is not None:
                page.content = content
            if content_json is not None:
                page.content_json = content_json

            page.updated_at = datetime.now()
            await session.commit()
            await session.refresh(page)

            return {
                "id": page.id,
                "title": page.title,
                "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            }

        return None

    # ========================================
    # LIST ASSETS — media/<module_name>/
    # ========================================

    @staticmethod
    async def list_assets(mod_id: int) -> List[Dict[str, str]]:
        """
        Get list of all images from media/<module_name>/.

        Returns list of dicts: { src, name, type }.
        """
        module_name = await _get_module_name(mod_id)
        if not module_name:
            return []

        media_dir = Path("media") / module_name
        media_dir.mkdir(parents=True, exist_ok=True)

        assets: List[Dict[str, str]] = []

        for filepath in sorted(media_dir.rglob('*')):
            if not filepath.is_file():
                continue

            ext = filepath.suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']:
                continue

            rel = filepath.relative_to(media_dir).as_posix()

            assets.append({
                "src": f"{MEDIA_URL}/{module_name}/{rel}",
                "name": filepath.name,
                "type": "image",
            })

        return assets

    # ========================================
    # UPLOAD ASSETS — media/<module_name>/
    # ========================================

    @staticmethod
    async def upload_assets(
        files: List[UploadFile],
        mod_id: int,
    ) -> List[str]:
        """
        Save uploaded files to media/<module_name>/.

        Special names (favicon.ico, robots.txt, sitemap.xml) — kept as-is.
        Other files — get a random 8-hex suffix.

        Returns list of URLs of uploaded files.
        """
        module_name = await _get_module_name(mod_id)
        if not module_name:
            raise ValueError(f"Module {mod_id} not found")

        media_dir = Path("media") / module_name
        media_dir.mkdir(parents=True, exist_ok=True)

        uploaded_urls: List[str] = []

        for uploaded_file in files:
            original_name = uploaded_file.filename or "file"
            clean_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', original_name)

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

            uploaded_urls.append(f"{MEDIA_URL}/{module_name}/{final_name}")

        return uploaded_urls


# ============================================
# HELPERS
# ============================================

def _page_to_dict(page) -> Dict[str, Any]:
    """Serialize Page model to dict."""
    return {
        "id": page.id,
        "mod_id": page.mod_id,
        "datetime": page.datetime.isoformat() if page.datetime else None,
        "title": page.title,
        "description": page.description,
        "logo": page.logo,
        "content": page.content,
        "content_json": page.content_json,
        "is_active": page.is_active,
        "is_delete": page.is_delete,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "rss_yandex_id": page.rss_yandex_id,
    }


async def _get_module_name(mod_id: int) -> Optional[str]:
    """Resolve module_name by mod_id."""
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == mod_id)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        return module.name if module else None
    return None