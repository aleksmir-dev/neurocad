# neurocad/core/engine/lib/word/llm/service.py

"""LLM service: presets (CRUD + thumbnails) and chat (page_chat)."""

import os
import re
import uuid
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from fastapi import UploadFile

from .....models.base import PagePres, PageChat, Page
from ......utils.sqlite import get_db_sqlite
from ......utils.llm.deepseek import generate_completion


# ============================================
# PATHS
# ============================================

# Media is relative to cwd: <project>/media/
MEDIA_ROOT = Path("media")
PRESETS_DIR = MEDIA_ROOT / "presets"
MEDIA_URL = "/media"

THUMBNAIL_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}


# ============================================
# SYSTEM PROMPT FOR HTML EDITOR
# ============================================

HTML_EDITOR_SYSTEM_PROMPT = """Ты — редактор HTML-кода.

Пользователь даёт тебе HTML-фрагмент (может быть пустым) и запрос на русском.
Ты возвращаешь JSON-объект с двумя полями:
  - "message": короткое сообщение пользователю (1 предложение).
  - "html": изменённый HTML-фрагмент.

СТРОГИЕ ПРАВИЛА:
1. Ответ — ТОЛЬКО валидный JSON. Начинается с `{`, заканчивается `}`.
2. НЕ оборачивай в markdown (без ```json, без ```).
3. НЕ добавляй пояснения до или после JSON.
4. Поле "message" — короткое, нейтральное: «Готово», «Изменения применены». НЕ пересказывай HTML.
5. Поле "html" — ТОЛЬКО HTML. Начинается с `<`, заканчивается `>`. Без <!DOCTYPE html>, <html>, <head>, <body>.
6. Если HTML пустой — создай новый фрагмент по запросу.
7. Если HTML непустой — измени его, сохранив всё, что не касается запроса.
8. Если не понял запрос — верни исходный HTML и message: «Не понял запрос, попробуйте переформулировать».

ПРИМЕР 1 (есть HTML):
Вход:
HTML:
<h1>Заголовок</h1>
Запрос: Сделай заголовок красным

Выход:
{"message": "Заголовок стал красным.", "html": "<h1 style=\\"color: red;\\">Заголовок</h1>"}

ПРИМЕР 2 (пустой HTML):
Вход:
HTML:
(пусто)
Запрос: Создай страницу с заголовком «Привет» и списком из 3 пунктов

Выход:
{"message": "Страница создана.", "html": "<h1>Привет</h1><ul><li>Первый</li><li>Второй</li><li>Третий</li></ul>"}
"""


class LLMService:
    """LLM editor service: presets and chat."""

    # ========================================
    # LIST PRESETS
    # ========================================

    @staticmethod
    async def list_presets(
        include_deleted: bool = False,
    ) -> Dict[str, Any]:
        """
        Get presets list.

        include_deleted = False → only active (is_delete = 0)
        include_deleted = True  → all
        """
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

    # ========================================
    # GET PRESET
    # ========================================

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
                "thumbnail_path": preset.thumbnail_path,
                "is_delete": preset.is_delete,
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
            }

        return None

    # ========================================
    # CREATE PRESET
    # ========================================

    @staticmethod
    async def create_preset(
        name: str,
        description: Optional[str] = None,
        html: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create a new preset."""
        async for session in get_db_sqlite():
            new_preset = PagePres(
                name=name.strip(),
                description=description,
                html=html,
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
                "thumbnail_path": new_preset.thumbnail_path,
                "is_delete": new_preset.is_delete,
                "created_at": new_preset.created_at.isoformat() if new_preset.created_at else None,
                "updated_at": new_preset.updated_at.isoformat() if new_preset.updated_at else None,
            }

        return None

    # ========================================
    # UPDATE PRESET
    # ========================================

    @staticmethod
    async def update_preset(
        preset_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        html: Optional[str] = None,
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

            preset.updated_at = datetime.now()
            await session.commit()
            await session.refresh(preset)

            return {
                "id": preset.id,
                "name": preset.name,
                "description": preset.description,
                "html": preset.html,
                "thumbnail_path": preset.thumbnail_path,
                "is_delete": preset.is_delete,
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
            }

        return None

    # ========================================
    # SOFT DELETE
    # ========================================

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

    # ========================================
    # RESTORE
    # ========================================

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

    # ========================================
    # UPLOAD THUMBNAIL
    # ========================================

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
            if ext not in THUMBNAIL_EXTENSIONS:
                raise ValueError(f"Invalid extension: {ext}. Allowed: {', '.join(THUMBNAIL_EXTENSIONS)}")

            PRESETS_DIR.mkdir(parents=True, exist_ok=True)

            final_name = f"{preset_id}{ext}"
            save_path = PRESETS_DIR / final_name

            # Remove old thumbnail
            for old_ext in THUMBNAIL_EXTENSIONS:
                old_file = PRESETS_DIR / f"{preset_id}{old_ext}"
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

    # ========================================
    # DELETE THUMBNAIL
    # ========================================

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

            for ext in THUMBNAIL_EXTENSIONS:
                file_path = PRESETS_DIR / f"{preset_id}{ext}"
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

    # ========================================
    # CHAT — HISTORY
    # ========================================

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

    # ========================================
    # CHAT — SAVE MESSAGE
    # ========================================

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

    # ========================================
    # CHAT — SEND MESSAGE TO LLM
    # ========================================

    @staticmethod
    async def send_chat_message(
        page_id: int,
        user_message: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Handle one user message:
          1. Load current page HTML.
          2. Save user message to page_chat.
          3. Send to LLM (system + HTML + request).
          4. Parse LLM response into {message, html}.
          5. Save assistant message to page_chat (with short message).
          6. Update page HTML.
          7. Return { user_message, assistant_message, html }.
        """

        # ===== 1. Load page =====
        async for session in get_db_sqlite():
            page_stmt = select(Page).where(
                Page.id == page_id,
                Page.is_delete == 0,
            )
            page_result = await session.execute(page_stmt)
            page = page_result.scalar_one_or_none()

            if not page:
                return None

            current_html = page.content or ''

            # ===== 2. Save user message =====
            user_msg = PageChat(
                page_id=page_id,
                role='user',
                content=user_message,
                created_at=datetime.now(),
            )
            session.add(user_msg)
            await session.commit()
            await session.refresh(user_msg)
            user_msg_dict = {
                "id": user_msg.id,
                "role": user_msg.role,
                "content": user_msg.content,
                "created_at": user_msg.created_at.isoformat() if user_msg.created_at else None,
            }

            # ===== 3. Build messages for LLM =====
            html_part = current_html.strip() if current_html and current_html.strip() else "(empty)"

            messages = [
                {"role": "system", "content": HTML_EDITOR_SYSTEM_PROMPT},
                {"role": "user", "content": f"HTML:\n{html_part}\n\nRequest: {user_message}"},
            ]

            # ===== 4. Request to DeepSeek =====
            try:
                raw_response = await generate_completion(messages)
            except Exception as e:
                raw_response = json.dumps({
                    "message": f"LLM error: {e}",
                    "html": "",
                }, ensure_ascii=False)

            # ===== 5. Parse LLM response =====
            parsed = LLMService._parse_llm_response(raw_response)
            new_html = parsed["html"]
            chat_message = parsed["message"]

            # ===== 6. Save assistant message =====
            assistant_msg = PageChat(
                page_id=page_id,
                role='assistant',
                content=chat_message,
                model=None,
                created_at=datetime.now(),
            )
            session.add(assistant_msg)
            await session.commit()
            await session.refresh(assistant_msg)
            assistant_msg_dict = {
                "id": assistant_msg.id,
                "role": assistant_msg.role,
                "content": assistant_msg.content,
                "created_at": assistant_msg.created_at.isoformat() if assistant_msg.created_at else None,
            }

            # ===== 7. Update page HTML =====
            if new_html:
                page.content = new_html
                page.updated_at = datetime.now()
                await session.commit()

            return {
                "user_message": user_msg_dict,
                "assistant_message": assistant_msg_dict,
                "html": new_html,
            }

        return None

    # ========================================
    # UTILS
    # ========================================

    @staticmethod
    def _parse_llm_response(text: str) -> Dict[str, str]:
        """
        Parse LLM response into {message, html}.

        Expect JSON: {"message": "...", "html": "..."}.
        If JSON invalid — fallback (no crash):
          - message = neutral
          - html = cleaned text as HTML
        """
        if not text:
            return {"message": "Empty LLM response.", "html": ""}

        s = text.strip()

        # 1. Remove markdown wrapper ```json ... ```
        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]
            s = s.strip()

        # 2. Find JSON in text (if model added something before/after)
        start = s.find('{')
        end = s.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = s[start:end + 1]
            try:
                data = json.loads(candidate)
                if isinstance(data, dict):
                    message = str(data.get("message", "")).strip() or "Done."
                    html = str(data.get("html", "")).strip()
                    return {"message": message, "html": html}
            except json.JSONDecodeError:
                pass

        # 3. Direct attempt — maybe already valid JSON
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                message = str(data.get("message", "")).strip() or "Done."
                html = str(data.get("html", "")).strip()
                return {"message": message, "html": html}
        except json.JSONDecodeError:
            pass

        # 4. Fallback: not JSON — treat as HTML
        cleaned = LLMService._clean_html_response(s)

        return {
            "message": "Done. Changes applied.",
            "html": cleaned,
        }

    @staticmethod
    def _clean_html_response(text: str) -> str:
        """Remove markdown wrappers (```html ... ```) if LLM added them."""
        if not text:
            return text

        s = text.strip()

        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]

        return s.strip()