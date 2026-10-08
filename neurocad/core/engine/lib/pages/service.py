# neurocad/core/engine/lib/pages/service.py

from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from ....models.base import Page
from ....models.nav import Nav
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
    CARD_TYPE_PAGE,
    CARD_TYPE_FOLDER,
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
        parent_id: Optional[int] = None,
        parent_id_provided: bool = False,
    ) -> Dict[str, Any]:
        """
        Get a paginated list of articles.

        nav_id — nav instance (whose catalog this is)
        page — page number (1-based)
        limit — page size
        is_active — filter: 1 (active only), 0 (inactive only), None (all)
        is_template — filter: 1 (templates only), 0 (regular only), None (all)

        Folder mode:
          - parent_id_provided=False → no parent filter (backward
            compatible; returns the whole flat list). This is what
            old callers get.
          - parent_id_provided=True, parent_id=None → only items
            with parent_id IS NULL (the root).
          - parent_id_provided=True, parent_id=<id> → only items
            whose parent_id == <id>.

        Folders are sorted before pages, then by sort_order + title.
        Pages are sorted by datetime DESC (newest first), then by
        sort_order.

        For each folder in the result, `children_count` is filled
        with the number of its live children. For pages, it is None.
        """
        offset = (page - 1) * limit

        async for session in get_db_sqlite():
            # ---- Base filter ----
            base_stmt = select(Page).where(
                Page.nav_id == nav_id,
                Page.is_delete == 0,
            )

            if is_active is not None:
                base_stmt = base_stmt.where(Page.is_active == is_active)

            if is_template is not None:
                base_stmt = base_stmt.where(Page.is_template == is_template)

            # ---- Parent filter (folder mode) ----
            if parent_id_provided:
                if parent_id is None:
                    base_stmt = base_stmt.where(Page.parent_id.is_(None))
                else:
                    base_stmt = base_stmt.where(Page.parent_id == parent_id)

            # ---- Count ----
            count_stmt = select(func.count()).select_from(base_stmt.subquery())
            total_result = await session.execute(count_stmt)
            total = total_result.scalar_one()

            # ---- Fetch page ----
            # Ordering at the DB level: folders first (0), pages second (1).
            # Inside each group — sort_order ASC, then datetime DESC for
            # pages and title for folders (title is not sortable at the
            # SQL level in a locale-aware way, but alphabetical by
            # `title` is fine).
            stmt = (
                base_stmt
                .order_by(
                    # Folders first
                    (Page.card_type == CARD_TYPE_FOLDER).desc(),
                    # Manual sort order ascending
                    Page.sort_order.asc(),
                    # Then by datetime DESC (only meaningful for pages)
                    Page.datetime.desc(),
                    Page.id.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()

            # ---- children_count for folders ----
            # One extra query — collect ids of folders in the page,
            # then count their children in a single grouped query.
            folder_ids = [p.id for p in rows if p.card_type == CARD_TYPE_FOLDER]
            children_map: Dict[int, int] = {}
            if folder_ids:
                cnt_stmt = (
                    select(Page.parent_id, func.count(Page.id))
                    .where(
                        Page.parent_id.in_(folder_ids),
                        Page.is_delete == 0,
                    )
                    .group_by(Page.parent_id)
                )
                cnt_rows = (await session.execute(cnt_stmt)).all()
                children_map = {pid: cnt for pid, cnt in cnt_rows if pid is not None}

            items = []
            for page_item in rows:
                items.append(
                    CoreEngineLibPagesService._to_dict(
                        page_item,
                        children_count=children_map.get(page_item.id, 0)
                        if page_item.card_type == CARD_TYPE_FOLDER
                        else None,
                    )
                )

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

        Возвращает только активные, неудалённые, не-шаблонные СТРАНИЦЫ
        (card_type = 'page'). Папки в этот список не попадают —
        ссылаться на папку из контента бессмысленно.

        Каждая страница — с готовым ПУБЛИЧНЫМ URL вида
        /page/<YYYYMMDD>/<HHMMSS> (без nav_id — публичные URL
        host-based, см. pages/public/route.py). Если у страницы
        задан `url` (внешняя ссылка), он попадает в поле "url".

        exclude_page_id — исключить конкретную страницу (нельзя
        ссылаться на себя).

        Формат элемента:
            {
              "id": <page.id>,
              "title": <page.title>,
              "url": "/page/<YYYYMMDD>/<HHMMSS>"  или  "<external url>"
            }
        """
        async for session in get_db_sqlite():
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

            stmt = (
                select(Page)
                .where(
                    Page.nav_id.in_(nav_ids),
                    Page.is_delete == 0,
                    Page.is_active == 1,
                    Page.is_template == 0,
                    Page.card_type == CARD_TYPE_PAGE,
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

                if p.url and p.url.strip():
                    url = p.url.strip()
                else:
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
        """
        Get one article by ID (with content and content_json).

        Folders are not returned — card_type is required to be
        'page', so the editor never opens on a folder.
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.card_type == CARD_TYPE_PAGE,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            return CoreEngineLibPagesService._to_dict(page_item)

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

        Only card_type='page' is returned — folders have no datetime
        and never need to be looked up this way.
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
                Page.card_type == CARD_TYPE_PAGE,
            )
            result = await session.execute(stmt)
            page_item = result.scalar_one_or_none()

            if not page_item:
                return None

            return CoreEngineLibPagesService._to_dict(page_item)

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
        Create a new article or folder in the given nav.

        Before creating — checks the page limit via BalanceChecked
        (lazy, based on the owner's tariff). If the limit is hit,
        returns None — the route translates this into HTTP 403.

        Folders do NOT count against the page limit: `page_allowed`
        only counts card_type='page'. The balance check runs before
        we know the card_type — so we skip it for folders.

        If datetime is not provided, the current time is used
        (pages only — folders have no datetime).
        """
        # Resolve the owner of this nav — needed for the balance check.
        user_id = await CoreEngineLibPagesService._resolve_user_id(nav_id)
        if user_id is None:
            print(f"[Pages] create_item: nav {nav_id} has no owner")
            return None

        card_type = getattr(data, "card_type", CARD_TYPE_PAGE) or CARD_TYPE_PAGE
        is_folder = (card_type == CARD_TYPE_FOLDER)

        # Folders are not counted — the limit only protects pages.
        if not is_folder:
            bal, err, current_pages = await BalanceChecked.page_allowed(user_id)
            if err:
                print(f"[Pages] create_item: user {user_id} — {err} "
                      f"(pages={current_pages}, limit={bal.limit_pages if bal else '?'})")
                return None

        # Folders have no datetime. Pages get `now` if not provided.
        item_datetime = data.datetime
        if item_datetime is None and not is_folder:
            item_datetime = datetime.now()
        if is_folder:
            item_datetime = None

        parent_id = getattr(data, "parent_id", None)
        sort_order = int(getattr(data, "sort_order", 0) or 0)

        async for session in get_db_sqlite():
            new_item = Page(
                nav_id=nav_id,
                datetime=item_datetime,
                title=data.title.strip(),
                description=data.description,
                logo=data.logo,
                content=data.content if not is_folder else None,
                content_json=data.content_json if not is_folder else None,
                is_active=data.is_active,
                is_delete=0,
                is_template=(getattr(data, "is_template", 0) or 0) if not is_folder else 0,
                template_id=(getattr(data, "template_id", None)) if not is_folder else None,
                url=(getattr(data, "url", None) or None) if not is_folder else None,
                card_type=card_type,
                parent_id=parent_id,
                sort_order=sort_order,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(new_item)
            await session.commit()
            await session.refresh(new_item)

            return CoreEngineLibPagesService._to_dict(new_item)

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
        """Update an article or folder."""
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

            # Fields that may be explicitly set to None (meaning "clear"):
            #   - template_id — unlink from a base template
            #   - url         — turn a link card back into a regular page
            #   - parent_id   — move the item to the root
            # Any other field with None value is skipped (the caller
            # did not send the field; keep the current value).
            noneable_fields = {"template_id", "url", "parent_id"}

            # `card_type` is intentionally NOT updatable here. See
            # schema.py — switching a folder into a page (or vice
            # versa) with children would leave the tree inconsistent
            # and must go through a dedicated endpoint.
            if "card_type" in update_data:
                update_data.pop("card_type", None)

            for key, value in update_data.items():
                if not hasattr(page_item, key):
                    continue
                if value is None and key not in noneable_fields:
                    continue
                if key == "url" and isinstance(value, str):
                    value = value.strip() or None
                setattr(page_item, key, value)

            page_item.updated_at = datetime.now()
            await session.commit()
            await session.refresh(page_item)

            return CoreEngineLibPagesService._to_dict(page_item)

        return None

    # ========================================
    # DELETE (SOFT)
    # ========================================

    @staticmethod
    async def delete_item(item_id: int, nav_id: int) -> bool:
        """
        Soft-delete an article or folder.

        Deleting a folder does NOT cascade — its children stay where
        they are, but `parent_id` is now pointing at a deleted
        folder. On the next list request, those children are
        invisible at the root level (they are not root items) and
        the folder itself is not shown (it is deleted). They are
        effectively orphaned.

        To keep that from happening, deleting a folder also
        detaches its immediate children — their parent_id is set to
        the deleted folder's parent_id. So the subtree is preserved
        and moved one level up.

        A deeper cascade (delete the whole subtree) is intentionally
        NOT done — a user who deletes a folder usually wants to keep
        the files.
        """
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

            # If this is a folder — detach its children first.
            if page_item.card_type == CARD_TYPE_FOLDER:
                children_stmt = select(Page).where(
                    Page.parent_id == page_item.id,
                    Page.is_delete == 0,
                )
                children = (await session.execute(children_stmt)).scalars().all()
                for child in children:
                    child.parent_id = page_item.parent_id
                    child.updated_at = datetime.now()

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
        Restore a soft-deleted article or folder.

        Restoring may push the user over the page limit — the check
        is NOT run here, because restored pages belong to the user
        (they were created earlier, under a valid tariff).

        Restoring a folder does NOT re-attach its former children —
        they were moved one level up at delete time. This is
        intentional: a half-restored tree is worse than a clean one,
        and the user can always drag children back in.
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
    # INTERNAL — SERIALIZATION
    # ========================================

    @staticmethod
    def _to_dict(
        page: Page,
        children_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Serialize a Page ORM object into the dict shape expected by
        the schema and the frontend.

        `children_count` is only passed for folders; it is None for
        pages. See get_list() — it computes this in one grouped
        query for all folders on the page.
        """
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
            "is_template": page.is_template or 0,
            "template_id": page.template_id,
            "created_at": page.created_at.isoformat() if page.created_at else None,
            "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            "rss_yandex_id": page.rss_yandex_id,
            "url": page.url,
            "card_type": page.card_type or CARD_TYPE_PAGE,
            "parent_id": page.parent_id,
            "sort_order": page.sort_order or 0,
            "children_count": children_count,
        }

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