# neurocad/core/engine/lib/pages/service.py

from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from ....models.base import Page
from ....models.nav import Nav
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
)
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.checked import BalanceChecked


class CoreEngineLibPagesService:
    """Service for working with articles."""

    # ========================================
    # LIST
    # ========================================

    @staticmethod
    async def get_list(
        nav_id: int,
        page: int = 1,
        limit: int = 20,
        is_active: Optional[int] = None,
        is_template: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get a paginated list of articles.

        nav_id — nav instance (whose catalog this is)
        page — page number (1-based)
        limit — page size
        is_active — filter: 1 (active only), 0 (inactive only), None (all)
        is_template — filter: 1 (templates only), 0 (regular only), None (all)
        """
        offset = (page - 1) * limit

        async for session in get_db_sqlite():
            base_stmt = select(Page).where(
                Page.nav_id == nav_id,
                Page.is_delete == 0,
            )

            if is_active is not None:
                base_stmt = base_stmt.where(Page.is_active == is_active)

            if is_template is not None:
                base_stmt = base_stmt.where(Page.is_template == is_template)

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
                    "is_template": page_item.is_template or 0,
                    "template_id": page_item.template_id,
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
    # LIST FOR USER — для редактора (выбор ссылки)
    # ========================================

    @staticmethod
    async def list_for_user(
        user_id: int,
        exclude_page_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Список страниц пользователя — для выбора ссылки в редакторе.

        Возвращает только активные, неудалённые, не-шаблонные страницы
        всех nav текущего юзера. Каждая с готовым ПУБЛИЧНЫМ URL вида

            /page/<YYYYMMDD>/<HHMMSS>

        NO nav_id — публичные URL host-based (пользователь резолвится
        из Host, страница ищется среди его nav'ов; см.
        pages/public/route.py). Ссылка, вставленная в контент статьи
        через trait page-link, попадает в <a href="..."> и позже
        рендерится на публичном домене — там nav_id быть не должно.

        exclude_page_id — исключить конкретную страницу (обычно — ту,
        которую сейчас редактирует пользователь: нельзя ссылаться на
        себя).

        Формат элемента:
            {
              "id": <page.id>,
              "title": <page.title>,
              "url": "/page/<YYYYMMDD>/<HHMMSS>"
            }
        """
        async for session in get_db_sqlite():
            # Найти все nav пользователя (по возрастанию id —
            # чтобы порядок был предсказуемым)
            nav_stmt = (
                select(Nav.id)
                .where(
                    Nav.user_id == user_id,
                    Nav.is_delete == False,
                )
                .order_by(Nav.id.asc())
            )
            nav_rows = (await session.execute(nav_stmt)).all()
            nav_ids = [r[0] for r in nav_rows]
            if not nav_ids:
                return []

            # Все активные неудалённые не-шаблонные страницы этих nav
            stmt = (
                select(Page)
                .where(
                    Page.nav_id.in_(nav_ids),
                    Page.is_delete == 0,
                    Page.is_active == 1,
                    Page.is_template == 0,
                )
                .order_by(Page.datetime.desc())
            )
            if exclude_page_id is not None:
                stmt = stmt.where(Page.id != exclude_page_id)

            result = await session.execute(stmt)
            rows = result.scalars().all()

            items: List[Dict[str, Any]] = []
            for p in rows:
                if not p.datetime:
                    continue
                # Public URL — host-based, no nav_id. The owner of
                # the URL is resolved from the Host on the public
                # side (see pages/public/route.py).
                url = (
                    f"/page/"
                    f"{p.datetime.strftime('%Y%m%d')}/"
                    f"{p.datetime.strftime('%H%M%S')}"
                )
                items.append({
                    "id": p.id,
                    "title": p.title or f"Страница {p.id}",
                    "url": url,
                })

            return items

        return []

    # ========================================
    # ONE ITEM BY ID
    # ========================================

    @staticmethod
    async def get_item(item_id: int, nav_id: int) -> Optional[Dict[str, Any]]:
        """Get one article by ID (with content and content_json)."""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
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
                "is_template": page_item.is_template or 0,
                "template_id": page_item.template_id,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
                "rss_yandex_id": page_item.rss_yandex_id,
            }

        return None

    # ========================================
    # ONE ITEM BY DATETIME
    # ========================================

    @staticmethod
    async def get_by_datetime(
        date: str,
        time: str,
        nav_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Find a page by date and time within a nav.

        date = "20260914" (YYYYMMDD)
        time = "153910"   (HHMMSS)

        datetime in the DB is stored with microseconds (15:39:10.666406),
        so we search in the range [dt_start, dt_start + 1 sec).
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError as e:
            print(f"[Pages] Invalid date/time: {date} {time} — {e}")
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.nav_id == nav_id,
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
                "is_template": page_item.is_template or 0,
                "template_id": page_item.template_id,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
                "rss_yandex_id": page_item.rss_yandex_id,
            }

        return None

    # ========================================
    # CREATE
    # ========================================

    @staticmethod
    async def create_item(
        data: CoreEngineLibPagesItemCreate,
        nav_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Create a new article in the given nav.

        Before creating — checks the page limit via BalanceChecked
        (lazy, based on the owner's tariff). If the limit is hit,
        returns None — the route translates this into HTTP 403.

        If datetime is not provided, the current time is used.
        """
        # Resolve the owner of this nav — needed for the balance check.
        user_id = await CoreEngineLibPagesService._resolve_user_id(nav_id)
        if user_id is None:
            print(f"[Pages] create_item: nav {nav_id} has no owner")
            return None

        # Lazy limit check (BalanceChecked internally applies the
        # day-change accruals before checking).
        bal, err, current_pages = await BalanceChecked.page_allowed(user_id)
        if err:
            print(f"[Pages] create_item: user {user_id} — {err} "
                  f"(pages={current_pages}, limit={bal.limit_pages if bal else '?'})")
            return None

        item_datetime = data.datetime
        if item_datetime is None:
            item_datetime = datetime.now()

        async for session in get_db_sqlite():
            new_item = Page(
                nav_id=nav_id,
                datetime=item_datetime,
                title=data.title.strip(),
                description=data.description,
                logo=data.logo,
                content=data.content,
                content_json=data.content_json,
                is_active=data.is_active,
                is_delete=0,
                is_template=getattr(data, "is_template", 0) or 0,
                template_id=getattr(data, "template_id", None),
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
                "is_template": new_item.is_template or 0,
                "template_id": new_item.template_id,
                "created_at": new_item.created_at.isoformat() if new_item.created_at else None,
                "updated_at": new_item.updated_at.isoformat() if new_item.updated_at else None,
            }

        return None

    # ========================================
    # UPDATE
    # ========================================

    @staticmethod
    async def update_item(
        item_id: int,
        data: CoreEngineLibPagesItemUpdate,
        nav_id: int,
    ) -> Optional[Dict[str, Any]]:
        """Update an article."""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            update_data = data.model_dump(exclude_unset=True)

            # template_id can be explicitly set to None (unlink from template)
            for key, value in update_data.items():
                if not hasattr(page_item, key):
                    continue
                if value is None and key != "template_id":
                    continue
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
                "is_template": page_item.is_template or 0,
                "template_id": page_item.template_id,
                "created_at": page_item.created_at.isoformat() if page_item.created_at else None,
                "updated_at": page_item.updated_at.isoformat() if page_item.updated_at else None,
            }

        return None

    # ========================================
    # DELETE (SOFT)
    # ========================================

    @staticmethod
    async def delete_item(item_id: int, nav_id: int) -> bool:
        """Soft-delete an article."""
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
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
    # RESTORE
    # ========================================

    @staticmethod
    async def restore_item(item_id: int, nav_id: int) -> bool:
        """
        Restore a soft-deleted article.

        Restoring may push the user over the page limit — the check
        is NOT run here, because restored pages belong to the user
        (they were created earlier, under a valid tariff).
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
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

    # ========================================
    # INTERNAL — NAV OWNER
    # ========================================

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