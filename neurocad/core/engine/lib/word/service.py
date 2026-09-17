# app/core/engine/lib/word/service.py

import os
import re
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import UploadFile

from sqlalchemy import select

from ....models.base import Page
from .....utils.sqlite import get_db_sqlite


# ============================================
# ПУТИ
# ============================================

# service.py лежит в: app/core/engine/lib/word/service.py
# .parent        -> app/core/engine/lib/word/
# .parent.parent -> app/core/engine/lib/
# .parent x3     -> app/core/engine/
# .parent x4     -> app/core/
# .parent x5     -> app/
APP_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

# Медиа лежит рядом с app/, т.е. в корне проекта: <root>/media/
MEDIA_ROOT = APP_DIR.parent / "media"
UPLOAD_DIR = MEDIA_ROOT / "uploads"
MEDIA_URL = "/media"


class CoreEngineLibWordService:
    """Сервис для работы с контентом и ассетами страницы"""

    # ========================================
    # ОДНА СТРАНИЦА ПО ДАТЕ/ВРЕМЕНИ
    # ========================================

    @staticmethod
    async def get_by_datetime(date: str, time: str) -> Optional[Dict[str, Any]]:
        """
        Найти страницу по дате и времени.

        date = "20260914" (YYYYMMDD)
        time = "153910"   (HHMMSS)

        В БД datetime хранится с микросекундами (15:39:10.666406),
        поэтому ищем в диапазоне [dt_start, dt_start + 1 сек).
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError as e:
            print(f"[Word] Некорректная дата/время: {date} {time} — {e}")
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.datetime >= dt_start,
                Page.datetime < dt_end,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            return {
                "id": page.id,
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

        return None

    # ========================================
    # ОДНА СТРАНИЦА ПО ID
    # ========================================

    @staticmethod
    async def get_by_id(page_id: int) -> Optional[Dict[str, Any]]:
        """Найти страницу по ID (с content и content_json)"""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            return {
                "id": page.id,
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

        return None

    # ========================================
    # СОХРАНЕНИЕ КОНТЕНТА
    # ========================================

    @staticmethod
    async def save_content(
        page_id: int,
        content: Optional[str],
        content_json: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Сохранить контент страницы.

        Обновляет поля content и content_json в модели Page.
        Возвращает обновлённые данные или None, если страница не найдена.
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()

            if not page:
                return None

            # Обновляем только то, что передано
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
    # СПИСОК АССЕТОВ
    # ========================================

    @staticmethod
    async def list_assets() -> List[Dict[str, str]]:
        """
        Получить список всех изображений из папки media/uploads.

        Возвращает список словарей: { src, name, type }.
        """
        assets = []

        # Создаём папку, если её нет
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        # Сканируем папку
        for filepath in sorted(UPLOAD_DIR.iterdir()):
            if not filepath.is_file():
                continue

            ext = filepath.suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']:
                continue

            assets.append({
                "src": f"{MEDIA_URL}/uploads/{filepath.name}",
                "name": filepath.name,
                "type": "image",
            })

        return assets

    # ========================================
    # ЗАГРУЗКА АССЕТОВ
    # ========================================

    @staticmethod
    async def upload_assets(files: List[UploadFile]) -> List[str]:
        """
        Сохранить загруженные файлы в папку media/uploads.

        Возвращает список URL загруженных файлов.
        """
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        uploaded_urls = []

        for uploaded_file in files:
            # Очищаем имя файла
            original_name = uploaded_file.filename or "file"
            clean_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', original_name)

            # Добавляем короткий UUID для уникальности
            name, ext = os.path.splitext(clean_name)
            suffix = uuid.uuid4().hex[:8]
            final_name = f"{name}_{suffix}{ext}"

            save_path = UPLOAD_DIR / final_name

            # Сохраняем файл
            with open(save_path, "wb") as buffer:
                while True:
                    chunk = await uploaded_file.read(1024 * 64)
                    if not chunk:
                        break
                    buffer.write(chunk)

            # Закрываем файл
            await uploaded_file.close()

            url = f"{MEDIA_URL}/uploads/{final_name}"
            uploaded_urls.append(url)

        return uploaded_urls