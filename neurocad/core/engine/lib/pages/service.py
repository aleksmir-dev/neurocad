# app/core/engine/lib/pages/service.py

from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from ....models.base import Page
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
)
from neurocad.utils.sqlite import get_db_sqlite


class CoreEngineLibPagesService:
    """Сервис для работы со статьями"""

    # ========================================
    # СПИСОК
    # ========================================

    @staticmethod
    async def get_list(
        page: int = 1,
        limit: int = 20,
        is_active: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Получить список статей с пагинацией.

        page — номер страницы (1-based)
        limit — размер страницы
        is_active — фильтр: 1 (только активные), 0 (только неактивные), None (все)
        """
        offset = (page - 1) * limit

        async for session in get_db_sqlite():
            base_stmt = select(Page).where(Page.is_delete == 0)

            if is_active is not None:
                base_stmt = base_stmt.where(Page.is_active == is_active)

            count_stmt = select(func.count()).select_from(base_stmt.subquery())
            total_result = await session.execute(count_stmt)
            total = total_result.scalar_one()

            stmt = (
                base_stmt
                .order_by(Page.datetime.desc())
                .offset(offset)
                .limit(limit)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()

            items = []
            for page_item in rows:
                items.append({
                    "id": page_item.id,
                    "datetime": page_item.datetime.isoformat() if page_item.datetime else None,
                    "title": page_item.title,
                    "description": page_item.description,
                    "logo": page_item.logo,
                    "is_active": page_item.is_active,
                    "is_delete": page_item.is_delete,
                    "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                    "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
                    "rss_yandex_id": page_item.rss_yandex_id,
                })

            return {
                "items": items,
                "total": total,
                "page": page,
                "limit": limit,
            }

        return {"items": [], "total": 0, "page": page, "limit": limit}

    # ========================================
    # ОДНА СТАТЬЯ ПО ID
    # ========================================

    @staticmethod
    async def get_item(item_id: int) -> Optional[Dict[str, Any]]:
        """Получить одну статью по ID (с content и content_json)"""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            return {
                "id": page_item.id,
                "datetime": page_item.datetime.isoformat() if page_item.datetime else None,
                "title": page_item.title,
                "description": page_item.description,
                "logo": page_item.logo,
                "content": page_item.content,
                "content_json": page_item.content_json,
                "is_active": page_item.is_active,
                "is_delete": page_item.is_delete,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
                "rss_yandex_id": page_item.rss_yandex_id,
            }

        return None

    # ========================================
    # ОДНА СТАТЬЯ ПО ДАТЕ/ВРЕМЕНИ
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
            print(f"[Pages] Некорректная дата/время: {date} {time} — {e}")
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.datetime >= dt_start,
                Page.datetime < dt_end,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            return {
                "id": page_item.id,
                "datetime": page_item.datetime.isoformat() if page_item.datetime else None,
                "title": page_item.title,
                "description": page_item.description,
                "logo": page_item.logo,
                "content": page_item.content,
                "content_json": page_item.content_json,
                "is_active": page_item.is_active,
                "is_delete": page_item.is_delete,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
                "rss_yandex_id": page_item.rss_yandex_id,
            }

        return None

    # ========================================
    # СОЗДАНИЕ
    # ========================================

    @staticmethod
    async def create_item(
        data: CoreEngineLibPagesItemCreate,
    ) -> Optional[Dict[str, Any]]:
        """Создать новую статью.

        Если datetime не передан — ставится текущее время.
        """
        item_datetime = data.datetime
        if item_datetime is None:
            item_datetime = datetime.now()

        async for session in get_db_sqlite():
            new_item = Page(
                datetime=item_datetime,
                title=data.title.strip(),
                description=data.description,
                logo=data.logo,
                content=data.content,
                content_json=data.content_json,
                is_active=data.is_active,
                is_delete=0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(new_item)
            await session.commit()
            await session.refresh(new_item)

            return {
                "id": new_item.id,
                "datetime": new_item.datetime.isoformat() if new_item.datetime else None,
                "title": new_item.title,
                "description": new_item.description,
                "logo": new_item.logo,
                "content": new_item.content,
                "content_json": new_item.content_json,
                "is_active": new_item.is_active,
                "is_delete": new_item.is_delete,
                "created_at": new_item.created_at.isoformat() if new_item.created_at else None,
                "updated_at": new_item.updated_at.isoformat() if new_item.updated_at else None,
            }

        return None

    # ========================================
    # ОБНОВЛЕНИЕ
    # ========================================

    @staticmethod
    async def update_item(
        item_id: int,
        data: CoreEngineLibPagesItemUpdate,
    ) -> Optional[Dict[str, Any]]:
        """Обновить статью"""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                if value is not None and hasattr(page_item, key):
                    setattr(page_item, key, value)

            page_item.updated_at = datetime.now()
            await session.commit()
            await session.refresh(page_item)

            return {
                "id": page_item.id,
                "datetime": page_item.datetime.isoformat() if page_item.datetime else None,
                "title": page_item.title,
                "description": page_item.description,
                "logo": page_item.logo,
                "content": page_item.content,
                "content_json": page_item.content_json,
                "is_active": page_item.is_active,
                "is_delete": page_item.is_delete,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
            }

        return None

    # ========================================
    # УДАЛЕНИЕ (МЯГКОЕ)
    # ========================================

    @staticmethod
    async def delete_item(item_id: int) -> bool:
        """Мягкое удаление статьи"""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return False

            page_item.is_delete = 1
            page_item.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ========================================
    # ВОССТАНОВЛЕНИЕ
    # ========================================

    @staticmethod
    async def restore_item(item_id: int) -> bool:
        """Восстановить удалённую статью"""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.is_delete == 1,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return False

            page_item.is_delete = 0
            page_item.updated_at = datetime.now()
            await session.commit()
            return True

        return False