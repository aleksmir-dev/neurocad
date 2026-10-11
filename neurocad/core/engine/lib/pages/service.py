# neurocad/core/engine/lib/pages/service.py

from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Set

from ....models.base import Page
from ....models.nav import Nav
from ....models.placement import Placement
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
        is_folder: Optional[int] = None,
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
        is_folder — filter: 1 (folders only), 0 (pages only), None (all).
            Used by the "move" picker: GET /list?is_folder=1 returns
            every folder in the nav as a flat list, so the client can
            build the tree for the destination picker.

        Folder mode:
          - parent_id_provided=False → no parent filter (backward
            compatible; returns the whole flat list). This is what
            old callers get — and what the move picker wants.
          - parent_id_provided=True, parent_id=None → only items
            with parent_id IS NULL (the root).
          - parent_id_provided=True, parent_id=<id> → only items
            whose parent_id == <id>.

        Folders are sorted before pages, then by sort_order + title.
        Pages are sorted by datetime DESC (newest first), then by
        sort_order.

        For each folder in the result, `children_count` is filled
        with the number of its live children. For pages, it is None.

        For each PAGE in the result, `creative_id` is filled with
        the currently attached creative (or None). This is read from
        the active placement row — see _load_active_creative_ids().
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

            if is_folder is not None:
                if is_folder == 1:
                    base_stmt = base_stmt.where(
                        Page.card_type == CARD_TYPE_FOLDER
                    )
                elif is_folder == 0:
                    base_stmt = base_stmt.where(
                        Page.card_type == CARD_TYPE_PAGE
                    )

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

            # ---- creative_id for pages ----
            # One extra query for the whole page — collect ids of
            # pages in the result, then load the active placement
            # for each in a single grouped query.
            page_ids = [p.id for p in rows if p.card_type == CARD_TYPE_PAGE]
            creative_map = await CoreEngineLibPagesService._load_active_creative_ids(
                session, page_ids,
            )

            items = []
            for page_item in rows:
                items.append(
                    CoreEngineLibPagesService._to_dict(
                        page_item,
                        children_count=children_map.get(page_item.id, 0)
                        if page_item.card_type == CARD_TYPE_FOLDER
                        else None,
                        creative_id=creative_map.get(page_item.id)
                        if page_item.card_type == CARD_TYPE_PAGE
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

        `creative_id` is filled in from the active placement row.
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

            creative_map = await CoreEngineLibPagesService._load_active_creative_ids(
                session, [page_item.id],
            )

            return CoreEngineLibPagesService._to_dict(
                page_item,
                creative_id=creative_map.get(page_item.id),
            )

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

            creative_map = await CoreEngineLibPagesService._load_active_creative_ids(
                session, [page_item.id],
            )

            return CoreEngineLibPagesService._to_dict(
                page_item,
                creative_id=creative_map.get(page_item.id),
            )

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

        Creative attachment:
        If `data.creative_id` is set AND the new item is a page
        (not a folder), a placement row is created in the same
        transaction (via _sync_placement). Folders never carry a
        creative.
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

        # Creative is only meaningful for pages.
        creative_id = getattr(data, "creative_id", None) if not is_folder else None

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
            await session.flush()   # need new_item.id for the placement

            # ---- Sync creative placement ----
            # Only for pages (not folders). If no creative — nothing
            # to sync (there is no active placement yet either).
            if not is_folder and creative_id:
                await CoreEngineLibPagesService._sync_placement(
                    session,
                    page_id=new_item.id,
                    creative_id=creative_id,
                    page_is_active=int(data.is_active or 0),
                )

            await session.commit()
            await session.refresh(new_item)

            creative_map = await CoreEngineLibPagesService._load_active_creative_ids(
                session, [new_item.id],
            )

            return CoreEngineLibPagesService._to_dict(
                new_item,
                creative_id=creative_map.get(new_item.id),
            )

        return None

    # ========================================
    # DUPLICATE
    # ========================================

    @staticmethod
    async def duplicate_item(
        item_id: int,
        nav_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Duplicate a page or folder inside the same nav.

        Copies ALL content fields:
          - title (with " (копия)" suffix), description, logo;
          - content, content_json, css;
          - url, card_type, parent_id, sort_order;
          - is_template, template_id, is_active.

        Resets:
          - id           → new (DB autoincrement);
          - datetime     → now() for pages; stays NULL for folders;
          - rss_yandex_id → None;
          - is_delete    → 0;
          - created_at / updated_at → now().

        Does NOT copy:
          - PageHist (history) — new page starts with empty history;
          - PageChat (LLM chat) — new page starts with empty chat;
          - Placements (creative attachment) — the copy starts with
            no creative. Attaching a copy to the same creative as
            the original would create a second placement for the
            same creative, which is never what the user wants.

        Datetime uniqueness:
          For pages, if the current second matches the original's
          second, we add 1 second so the public URL
          (/page/<YYYYMMDD>/<HHMMSS>) is unique. Without this, a
          copy made in the same second would collide with the
          original on the public route.

        Balance:
          This does NOT consume the page limit. Duplicating is
          treated as content management, not creation. If you ever
          want to count it, add a BalanceChecked.page_allowed()
          call before the insert — same as create_item.

        Returns the new item dict, or None if the original is not
        found or does not belong to this nav.
        """
        async for session in get_db_sqlite():
            # ---- Find original ----
            stmt = select(Page).where(
                Page.id == item_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
            )
            original = (await session.execute(stmt)).scalar_one_or_none()

            if not original:
                return None

            is_folder = (original.card_type == CARD_TYPE_FOLDER)

            # ---- Build new title ----
            base_title = (original.title or "").strip() or "Страница"
            copy_title = f"{base_title} (копия)"
            if len(copy_title) > 255:
                copy_title = copy_title[:252] + "..."

            # ---- Build new datetime (pages only) ----
            new_datetime = None
            if not is_folder:
                now = datetime.now()
                # If the original has the same second — shift by 1s,
                # so the public URL is unique. Compare on
                # (y, m, d, H, M, S), ignore microseconds.
                if original.datetime is not None:
                    orig_sec = original.datetime.replace(microsecond=0)
                    now_sec = now.replace(microsecond=0)
                    if orig_sec == now_sec:
                        now = now + timedelta(seconds=1)
                new_datetime = now

            # ---- Create copy ----
            new_item = Page(
                nav_id=nav_id,
                datetime=new_datetime,
                title=copy_title,
                description=original.description,
                logo=original.logo,
                content=original.content,
                content_json=original.content_json,
                css=original.css,
                url=original.url,
                card_type=original.card_type,
                parent_id=original.parent_id,
                sort_order=original.sort_order,
                is_template=original.is_template,
                template_id=original.template_id,
                is_active=original.is_active,
                is_delete=0,
                rss_yandex_id=None,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(new_item)
            await session.commit()
            await session.refresh(new_item)

            print(
                f"[Pages] duplicate_item: {original.id} -> {new_item.id} "
                f"({new_item.title!r})"
            )

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
        """
        Update an article or folder.

        Cycle prevention on parent_id
        -----------------------------
        A folder must not become a descendant of itself. Without
        this guard, PUT /item/<id> {parent_id: <descendant>} would
        silently corrupt the tree: the folder would contain its own
        ancestor, and any recursive walk (list, path build, delete
        detach) would loop forever.

        The check runs BEFORE the assignment, on the same session:
          - only when `parent_id` is present in the update payload;
          - only when the new parent_id is not null;
          - only when the item being moved is itself a folder
            (moving a page never creates a cycle).

        The chain is walked by parent_id links, with a depth limit
        as a safety net against pre-existing corruption.

        Creative attachment
        -------------------
        `creative_id` is NOT a column on the page — it is handled
        through the placements table. The rules:

          - creative_id NOT in payload  → leave the current
            attachment untouched;
          - creative_id is null / 0     → detach (close the active
            placement);
          - creative_id is a real id    → attach (create a new
            placement, closing the previous one if it was a
            different creative);
          - is_active = 0               → close the active placement
            (the page is unpublished, so the ad should stop).

        The sync happens in the same transaction as the page update.
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
                return None

            update_data = data.model_dump(exclude_unset=True)

            # ---- Cycle prevention ----
            # Only relevant when we are actually changing parent_id,
            # the new parent is not null, and the item is a folder.
            if (
                "parent_id" in update_data
                and update_data["parent_id"] is not None
                and page_item.card_type == CARD_TYPE_FOLDER
            ):
                new_parent_id = update_data["parent_id"]
                is_cycle = await CoreEngineLibPagesService._is_descendant(
                    session, page_item.id, new_parent_id,
                )
                if is_cycle:
                    print(
                        f"[Pages] update_item: refusing to move folder "
                        f"{page_item.id} into its own descendant "
                        f"{new_parent_id}"
                    )
                    return None

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

            # ---- Separate creative_id out of the page-column
            # update — it is not a column on Page, it lives in the
            # placements table. ----
            creative_present = "creative_id" in update_data
            new_creative_id = update_data.pop("creative_id", None)

            # ---- Detect a change of is_active for the placement sync ----
            is_active_present = "is_active" in update_data
            new_is_active = update_data.get("is_active")

            for key, value in update_data.items():
                if not hasattr(page_item, key):
                    continue
                if value is None and key not in noneable_fields:
                    continue
                if key == "url" and isinstance(value, str):
                    value = value.strip() or None
                setattr(page_item, key, value)

            page_item.updated_at = datetime.now()

            # ---- Sync creative placement ----
            # Only pages can carry a creative. Folders ignore it.
            if page_item.card_type == CARD_TYPE_PAGE:
                if creative_present:
                    # Explicit creative_id in payload: attach /
                    # detach / switch.
                    await CoreEngineLibPagesService._sync_placement(
                        session,
                        page_id=page_item.id,
                        creative_id=new_creative_id,
                        page_is_active=int(
                            new_is_active
                            if is_active_present
                            else page_item.is_active
                        ),
                    )
                elif is_active_present and int(new_is_active or 0) == 0:
                    # No creative in payload, but the page was just
                    # unpublished — close the active placement.
                    await CoreEngineLibPagesService._sync_placement(
                        session,
                        page_id=page_item.id,
                        creative_id=None,
                        page_is_active=0,
                    )

            await session.commit()
            await session.refresh(page_item)

            creative_map = await CoreEngineLibPagesService._load_active_creative_ids(
                session, [page_item.id],
            )

            return CoreEngineLibPagesService._to_dict(
                page_item,
                creative_id=creative_map.get(page_item.id),
            )

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

        Creative placements:
        Deleting a page closes its active placement (date_end =
        now, is_active = 0). The placement history is preserved —
        the rows stay in the table, they are just no longer active.
        Deleting a folder has no placement side-effect (folders
        never carry a creative).
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

            # If this is a page — close its active creative
            # placement. History is preserved.
            if page_item.card_type == CARD_TYPE_PAGE:
                await CoreEngineLibPagesService._sync_placement(
                    session,
                    page_id=page_item.id,
                    creative_id=None,
                    page_is_active=0,
                )

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

        Creative placements are NOT re-opened on restore. If the
        page had a creative before delete, that placement was closed
        at delete time. Re-opening it would resurrect stale ad
        dates. The user can re-attach a creative by editing the
        page — that creates a fresh placement.
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
    # INTERNAL — CREATIVE / PLACEMENT SYNC
    # ========================================

    @staticmethod
    async def _sync_placement(
        session,
        page_id: int,
        creative_id: Optional[int],
        page_is_active: int,
    ) -> None:
        """
        Reconcile the active placement row for a page with the
        desired creative attachment.

        Called from create_item(), update_item(), delete_item() —
        all in the same transaction as the page change.

        Rules
        -----
        Let `desired` be:
            - None   if creative_id is falsy OR page_is_active == 0
            - <int>  otherwise (the creative id to attach)

        Let `current` be the active placement for this page, i.e.
        the row with page_id = <page_id> AND date_end IS NULL.

        Then:

          1. desired is None, current is None
                → nothing to do.

          2. desired is None, current is not None
                → close current:
                    current.date_end = now()
                    current.is_active = 0

          3. desired = X, current is None
                → create a new active placement:
                    INSERT placements(
                        creative_id=X, page_id=<page_id>,
                        date_start=now(), date_end=NULL, is_active=1
                    )

          4. desired = X, current.creative_id == X
                → nothing to do (already attached to the right one).

          5. desired = X, current.creative_id != X
                → close current, then create a new one for X:
                    current.date_end = now()
                    current.is_active = 0
                    INSERT placements(
                        creative_id=X, page_id=<page_id>,
                        date_start=now(), date_end=NULL, is_active=1
                    )

        History is preserved in all cases: closed placements are
        never deleted, only closed. Only ONE active placement per
        page is allowed at a time (the `date_end IS NULL` filter
        enforces this by convention — the schema does not need a
        partial unique index, though it could be added).
        """
        # ---- Find the current active placement ----
        cur_stmt = (
            select(Placement)
            .where(
                Placement.page_id == page_id,
                Placement.date_end.is_(None),
            )
            .limit(1)
        )
        current = (await session.execute(cur_stmt)).scalar_one_or_none()

        # ---- Desired ----
        desired = None
        if creative_id and int(page_is_active or 0) != 0:
            desired = int(creative_id)

        # ---- Case 1 ----
        if desired is None and current is None:
            return

        # ---- Case 2 ----
        if desired is None and current is not None:
            current.date_end = datetime.now()
            current.is_active = 0
            return

        # ---- Case 4 ----
        if current is not None and int(current.creative_id) == desired:
            return

        # ---- Case 3 & 5: close the old one (if any), open a new one ----
        if current is not None:
            current.date_end = datetime.now()
            current.is_active = 0

        new_placement = Placement(
            creative_id=desired,
            page_id=page_id,
            date_start=datetime.now(),
            date_end=None,
            is_active=1,
        )
        session.add(new_placement)

    @staticmethod
    async def _load_active_creative_ids(
        session,
        page_ids: List[int],
    ) -> Dict[int, int]:
        """
        For the given page ids, return {page_id: creative_id} for
        each page that has an ACTIVE placement (date_end IS NULL).

        One grouped query — used by get_list() and get_item() to
        fill `creative_id` in the response payloads. Pages without
        an active placement are simply absent from the map.
        """
        if not page_ids:
            return {}

        stmt = (
            select(Placement.page_id, Placement.creative_id)
            .where(
                Placement.page_id.in_(page_ids),
                Placement.date_end.is_(None),
            )
        )
        rows = (await session.execute(stmt)).all()
        return {pid: cid for pid, cid in rows if pid is not None}

    # ========================================
    # INTERNAL — CYCLE CHECK
    # ========================================

    @staticmethod
    async def _is_descendant(
        session,
        ancestor_id: int,
        candidate_id: int,
    ) -> bool:
        """
        Return True if `candidate_id` is `ancestor_id` itself or
        anywhere in its subtree.

        Walks the tree UP from `candidate_id` via parent_id links
        until it either hits `ancestor_id` (→ True), hits the root
        (→ False), or exceeds the depth limit (→ True, treated as
        unsafe).

        Depth limit: 100. A real page tree is far shallower; a
        deeper chain means pre-existing corruption, and refusing
        the move is safer than allowing it.

        Used by update_item() to prevent moving a folder into its
        own descendant.
        """
        if ancestor_id == candidate_id:
            return True

        current_id = candidate_id
        depth = 0

        while current_id is not None and depth < 100:
            depth += 1

            if current_id == ancestor_id:
                return True

            stmt = select(Page.parent_id).where(Page.id == current_id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()

            # No such page, or reached the root — the chain ends.
            if row is None:
                return False

            current_id = row

        # Depth limit hit — assume unsafe.
        return True

    # ========================================
    # INTERNAL — SERIALIZATION
    # ========================================

    @staticmethod
    def _to_dict(
        page: Page,
        children_count: Optional[int] = None,
        creative_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Serialize a Page ORM object into the dict shape expected by
        the schema and the frontend.

        `children_count` is only passed for folders; it is None for
        pages. See get_list() — it computes this in one grouped
        query for all folders on the page.

        `creative_id` is only passed for pages; it is None for
        folders. See _load_active_creative_ids() — it is read from
        the active placement row, not from a Page column.
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
            "creative_id": creative_id,
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