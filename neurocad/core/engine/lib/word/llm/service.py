# neurocad/core/engine/lib/word/llm/service.py

"""
LLM-сервис: работа с пресетами (CRUD + миниатюры) и чатом (page_chat).
"""

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
# ПУТИ
# ============================================

APP_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent.parent

MEDIA_ROOT = Path("media")
PRESETS_DIR = MEDIA_ROOT / "presets"
MEDIA_URL = "/media"

THUMBNAIL_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}


# ============================================
# СИСТЕМНЫЙ ПРОМПТ ДЛЯ HTML-РЕДАКТОРА
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
    """Сервис LLM-редактора: пресеты и чат."""

    # ========================================
    # СПИСОК ПРЕСЕТОВ
    # ========================================

    @staticmethod
    async def list_presets(
        include_deleted: bool = False,
    ) -> Dict[str, Any]:
        """
        Получить список пресетов.

        include_deleted = False → только активные (is_delete = 0)
        include_deleted = True  → все
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
    # ОДИН ПРЕСЕТ
    # ========================================

    @staticmethod
    async def get_preset(preset_id: int) -> Optional[Dict[str, Any]]:
        """Получить один пресет по ID."""
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
    # СОЗДАНИЕ
    # ========================================

    @staticmethod
    async def create_preset(
        name: str,
        description: Optional[str] = None,
        html: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Создать новый пресет."""
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
    # ОБНОВЛЕНИЕ
    # ========================================

    @staticmethod
    async def update_preset(
        preset_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        html: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Обновить пресет. Обновляются только переданные поля."""
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
    # МЯГКОЕ УДАЛЕНИЕ
    # ========================================

    @staticmethod
    async def delete_preset(preset_id: int) -> bool:
        """Мягко удалить пресет (is_delete = 1)."""
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
    # ВОССТАНОВЛЕНИЕ
    # ========================================

    @staticmethod
    async def restore_preset(preset_id: int) -> bool:
        """Восстановить удалённый пресет (is_delete = 0)."""
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
    # МИНИАТЮРА
    # ========================================

    @staticmethod
    async def upload_thumbnail(
        preset_id: int,
        file: UploadFile,
    ) -> Optional[Dict[str, Any]]:
        """
        Загрузить PNG-миниатюру для пресета.
        """
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
                raise ValueError(f"Недопустимое расширение: {ext}. Разрешены: {', '.join(THUMBNAIL_EXTENSIONS)}")

            PRESETS_DIR.mkdir(parents=True, exist_ok=True)

            final_name = f"{preset_id}{ext}"
            save_path = PRESETS_DIR / final_name

            # Удаляем старую миниатюру
            for old_ext in THUMBNAIL_EXTENSIONS:
                old_file = PRESETS_DIR / f"{preset_id}{old_ext}"
                if old_file.exists() and old_file != save_path:
                    try:
                        old_file.unlink()
                    except Exception as e:
                        print(f"[LLM] Не удалось удалить старую миниатюру {old_file}: {e}")

            # Сохраняем файл
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
    # УДАЛЕНИЕ МИНИАТЮРЫ
    # ========================================

    @staticmethod
    async def delete_thumbnail(preset_id: int) -> bool:
        """Удалить миниатюру пресета (файл + запись в БД)."""
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
                        print(f"[LLM] Не удалось удалить файл {file_path}: {e}")

            preset.thumbnail_path = None
            preset.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ========================================
    # ЧАТ — ИСТОРИЯ
    # ========================================

    @staticmethod
    async def load_chat_history(page_id: int) -> List[Dict[str, Any]]:
        """Загрузить всю историю чата по странице, от старых к новым."""
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
    # ЧАТ — СОХРАНЕНИЕ СООБЩЕНИЯ
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
        """Сохранить одно сообщение чата."""
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
    # ЧАТ — ОТПРАВКА СООБЩЕНИЯ В LLM
    # ========================================

    @staticmethod
    async def send_chat_message(
        page_id: int,
        user_message: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Обработать одно сообщение пользователя:
          1. Загрузить текущий HTML страницы.
          2. Сохранить сообщение пользователя в page_chat.
          3. Отправить в LLM (system + HTML + запрос).
          4. Распарсить ответ LLM в {message, html}.
          5. Сохранить ответ ассистента в page_chat (там — message).
          6. Обновить HTML страницы.
          7. Вернуть { user_message, assistant_message, html }.
        """

        # ===== 1. Загружаем страницу =====
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

            # ===== 2. Сохраняем сообщение пользователя =====
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

            # ===== 3. Собираем messages для LLM =====
            html_part = current_html.strip() if current_html and current_html.strip() else "(пусто)"

            messages = [
                {"role": "system", "content": HTML_EDITOR_SYSTEM_PROMPT},
                {"role": "user", "content": f"HTML:\n{html_part}\n\nЗапрос: {user_message}"},
            ]

            # ===== 4. Запрос к DeepSeek =====
            try:
                raw_response = await generate_completion(messages)
            except Exception as e:
                # Fallback на случай сетевой ошибки
                raw_response = json.dumps({
                    "message": f"Ошибка LLM: {e}",
                    "html": "",
                }, ensure_ascii=False)

            # ===== 5. Парсим ответ LLM =====
            parsed = LLMService._parse_llm_response(raw_response)
            new_html = parsed["html"]
            chat_message = parsed["message"]

            # ===== 6. Сохраняем ответ ассистента =====
            assistant_msg = PageChat(
                page_id=page_id,
                role='assistant',
                content=chat_message,   # в чат — короткое сообщение
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

            # ===== 7. Обновляем HTML страницы =====
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
    # УТИЛИТЫ
    # ========================================

    @staticmethod
    def _parse_llm_response(text: str) -> Dict[str, str]:
        """
        Разобрать ответ LLM в {message, html}.

        Ожидаем JSON: {"message": "...", "html": "..."}.
        Если JSON невалидный — fallback (не падаем):
          - message = нейтральное
          - html = очищенный текст как HTML
        """
        if not text:
            return {"message": "Пустой ответ LLM.", "html": ""}

        s = text.strip()

        # 1. Убираем markdown-обёртку ```json ... ```
        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]
            s = s.strip()

        # 2. Ищем JSON в тексте (если модель добавила что-то до/после)
        #    Первый `{` и последний `}`.
        start = s.find('{')
        end = s.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = s[start:end + 1]
            try:
                data = json.loads(candidate)
                if isinstance(data, dict):
                    message = str(data.get("message", "")).strip() or "Готово."
                    html = str(data.get("html", "")).strip()
                    return {"message": message, "html": html}
            except json.JSONDecodeError:
                pass

        # 3. Прямая попытка — вдруг уже валидный JSON
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                message = str(data.get("message", "")).strip() or "Готово."
                html = str(data.get("html", "")).strip()
                return {"message": message, "html": html}
        except json.JSONDecodeError:
            pass

        # 4. Fallback: не JSON — считаем, что это HTML
        cleaned = LLMService._clean_html_response(s)

        return {
            "message": "Готово. Изменения применены.",
            "html": cleaned,
        }

    @staticmethod
    def _clean_html_response(text: str) -> str:
        """
        Убрать markdown-обёртки (```html ... ```), если LLM их добавил.
        """
        if not text:
            return text

        s = text.strip()

        # ```html\n...\n```
        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]

        return s.strip()