# neurocad/core/engine/lib/word/llm/service.py

"""
LLM service: presets (CRUD + thumbnails) and chat history (page_chat).

Namespace: CoreEngineLibWordLlmService

Note: LLM calls (routing, agents) live in ws.py + agent/*.py.
This service only handles DB-side operations: presets and chat history.
"""

import os
import re
import uuid
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, delete
from fastapi import UploadFile

from .....models.base import PagePres, PageChat
from ......utils.sqlite import get_db_sqlite


class CoreEngineLibWordLlmService:
    """LLM editor service: presets and chat history."""

    # ============================================
    # PATHS / CONFIG
    # ============================================

    # Media is relative to cwd: <project>/media/
    MEDIA_ROOT = Path("media")
    PRESETS_DIR = MEDIA_ROOT / "presets"
    MEDIA_URL = "/media"

    THUMBNAIL_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}

    #: How many previous messages to include as dialogue context.
    HISTORY_LIMIT = 20

    # ============================================
    # LIST PRESETS
    # ============================================

    @staticmethod
    async def list_presets(
        include_deleted: bool = False,
    ) -> Dict[str, Any]:
        """Get presets list."""
        async for session in get_db_sqlite():
            stmt = select(PagePres)

            if not include_deleted:
                stmt = stmt.where(PagePres.is_delete == 0)

            stmt = stmt.order_by(PagePres.created_at.asc())

            result = await session.execute(stmt)
            rows = result.scalars().all()

            items = []
            for preset in rows:
                items.append({
                    "id": preset.id,
                    "name": preset.name,
                    "description": preset.description,
                    "html": preset.html,
                    "css": preset.css,
                    "thumbnail_path": preset.thumbnail_path,
                    "is_delete": preset.is_delete,
                    "created_at": preset.created_at.isoformat() if preset.created_at else None,
                    "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
                })

            return {
                "items": items,
                "total": len(items),
            }

        return {"items": [], "total": 0}

    # ============================================
    # GET PRESET
    # ============================================

    @staticmethod
    async def get_preset(preset_id: int) -> Optional[Dict[str, Any]]:
        """Get one preset by ID."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 0,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return None

            return {
                "id": preset.id,
                "name": preset.name,
                "description": preset.description,
                "html": preset.html,
                "css": preset.css,
                "thumbnail_path": preset.thumbnail_path,
                "is_delete": preset.is_delete,
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
            }

        return None

    # ============================================
    # CREATE PRESET
    # ============================================

    @staticmethod
    async def create_preset(
        name: str,
        description: Optional[str] = None,
        html: Optional[str] = None,
        css: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create a new preset."""
        async for session in get_db_sqlite():
            new_preset = PagePres(
                name=name.strip(),
                description=description,
                html=html,
                css=css,
                is_delete=0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(new_preset)
            await session.commit()
            await session.refresh(new_preset)

            return {
                "id": new_preset.id,
                "name": new_preset.name,
                "description": new_preset.description,
                "html": new_preset.html,
                "css": new_preset.css,
                "thumbnail_path": new_preset.thumbnail_path,
                "is_delete": new_preset.is_delete,
                "created_at": new_preset.created_at.isoformat() if new_preset.created_at else None,
                "updated_at": new_preset.updated_at.isoformat() if new_preset.updated_at else None,
            }

        return None

    # ============================================
    # UPDATE PRESET
    # ============================================

    @staticmethod
    async def update_preset(
        preset_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        html: Optional[str] = None,
        css: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update preset. Only provided fields are updated."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 0,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return None

            if name is not None:
                preset.name = name.strip()
            if description is not None:
                preset.description = description
            if html is not None:
                preset.html = html
            if css is not None:
                preset.css = css

            preset.updated_at = datetime.now()
            await session.commit()
            await session.refresh(preset)

            return {
                "id": preset.id,
                "name": preset.name,
                "description": preset.description,
                "html": preset.html,
                "css": preset.css,
                "thumbnail_path": preset.thumbnail_path,
                "is_delete": preset.is_delete,
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
            }

        return None

    # ============================================
    # SOFT DELETE
    # ============================================

    @staticmethod
    async def delete_preset(preset_id: int) -> bool:
        """Soft delete preset (is_delete = 1)."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 0,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return False

            preset.is_delete = 1
            preset.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ============================================
    # RESTORE
    # ============================================

    @staticmethod
    async def restore_preset(preset_id: int) -> bool:
        """Restore deleted preset (is_delete = 0)."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 1,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return False

            preset.is_delete = 0
            preset.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ============================================
    # UPLOAD THUMBNAIL
    # ============================================

    @staticmethod
    async def upload_thumbnail(
        preset_id: int,
        file: UploadFile,
    ) -> Optional[Dict[str, Any]]:
        """Upload PNG thumbnail for preset."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 0,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return None

            original_name = file.filename or "thumbnail.png"
            ext = Path(original_name).suffix.lower()
            if ext not in CoreEngineLibWordLlmService.THUMBNAIL_EXTENSIONS:
                raise ValueError(
                    f"Invalid extension: {ext}. "
                    f"Allowed: {', '.join(CoreEngineLibWordLlmService.THUMBNAIL_EXTENSIONS)}"
                )

            CoreEngineLibWordLlmService.PRESETS_DIR.mkdir(parents=True, exist_ok=True)

            final_name = f"{preset_id}{ext}"
            save_path = CoreEngineLibWordLlmService.PRESETS_DIR / final_name

            for old_ext in CoreEngineLibWordLlmService.THUMBNAIL_EXTENSIONS:
                old_file = CoreEngineLibWordLlmService.PRESETS_DIR / f"{preset_id}{old_ext}"
                if old_file.exists() and old_file != save_path:
                    try:
                        old_file.unlink()
                    except Exception as e:
                        print(f"[LLM] Failed to remove old thumbnail {old_file}: {e}")

            with open(save_path, "wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 64)
                    if not chunk:
                        break
                    buffer.write(chunk)
            await file.close()

            thumbnail_path = f"presets/{final_name}"
            preset.thumbnail_path = thumbnail_path
            preset.updated_at = datetime.now()
            await session.commit()
            await session.refresh(preset)

            return {
                "id": preset.id,
                "thumbnail_path": thumbnail_path,
            }

        return None

    # ============================================
    # DELETE THUMBNAIL
    # ============================================

    @staticmethod
    async def delete_thumbnail(preset_id: int) -> bool:
        """Delete preset thumbnail (file + DB record)."""
        async for session in get_db_sqlite():
            stmt = select(PagePres).where(
                PagePres.id == preset_id,
                PagePres.is_delete == 0,
            )
            result = await session.execute(stmt)
            preset = result.scalar_one_or_none()

            if not preset:
                return False

            for ext in CoreEngineLibWordLlmService.THUMBNAIL_EXTENSIONS:
                file_path = CoreEngineLibWordLlmService.PRESETS_DIR / f"{preset_id}{ext}"
                if file_path.exists():
                    try:
                        file_path.unlink()
                    except Exception as e:
                        print(f"[LLM] Failed to remove file {file_path}: {e}")

            preset.thumbnail_path = None
            preset.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ============================================
    # CHAT — HISTORY
    # ============================================

    @staticmethod
    async def load_chat_history(page_id: int) -> List[Dict[str, Any]]:
        """Load full chat history by page, from old to new."""
        async for session in get_db_sqlite():
            stmt = (
                select(PageChat)
                .where(PageChat.page_id == page_id)
                .order_by(PageChat.created_at.asc(), PageChat.id.asc())
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()

            return [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "model": m.model,
                    "prompt_tokens": m.prompt_tokens,
                    "completion_tokens": m.completion_tokens,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in rows
            ]

        return []

    # ============================================
    # CHAT — CLEAR HISTORY
    # ============================================

    @staticmethod
    async def clear_chat_history(page_id: int) -> int:
        """
        Delete all chat messages for a page.

        Returns the number of deleted rows.
        """
        async for session in get_db_sqlite():
            stmt = delete(PageChat).where(PageChat.page_id == page_id)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount or 0

        return 0

    # ============================================
    # CHAT — SAVE MESSAGE
    # ============================================

    @staticmethod
    async def save_chat_message(
        page_id: int,
        role: str,
        content: str,
        model: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Save one chat message."""
        async for session in get_db_sqlite():
            msg = PageChat(
                page_id=page_id,
                role=role,
                content=content,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                created_at=datetime.now(),
            )
            session.add(msg)
            await session.commit()
            await session.refresh(msg)

            return {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "model": msg.model,
                "prompt_tokens": msg.prompt_tokens,
                "completion_tokens": msg.completion_tokens,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }

        return None

    # ============================================
    # CHAT — LOAD HISTORY AS MESSAGES
    # ============================================

    @staticmethod
    async def load_history_messages(
        page_id: int,
        limit: Optional[int] = None,
    ) -> List[Dict[str, str]]:
        """
        Load the last `limit` messages from page_chat and return them
        as a list of {"role": "user"|"assistant", "content": "..."}
        dicts, oldest → newest.
        """
        if limit is None:
            limit = CoreEngineLibWordLlmService.HISTORY_LIMIT

        rows = await CoreEngineLibWordLlmService.load_chat_history(page_id)
        tail = rows[-limit:] if len(rows) > limit else rows
        return [
            {"role": m["role"], "content": m["content"]}
            for m in tail
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]