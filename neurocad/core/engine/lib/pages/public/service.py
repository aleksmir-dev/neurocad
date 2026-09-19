# neurocad/core/engine/lib/pages/public/service.py

"""
Public pages service.

Read-only access to Page records for public HTML rendering.
No admin fields (content_json, is_active, is_delete, etc.).

Namespace: CoreEngineLibPagesPublicService
"""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select

from .....models.base import Page
from .....models.module import Module
from ......utils.sqlite import get_db_sqlite
from .schema import CoreEngineLibPagesPublicItem


# Default module name for public pages
DEFAULT_MODULE = "default"


class CoreEngineLibPagesPublicService:
    """Read-only service for public page rendering."""

    # ========================================
    # MAIN PAGE
    # ========================================

    @staticmethod
    async def get_main_page(
        module_name: str = DEFAULT_MODULE,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Get the main page of a module.

        Currently: the first active page (ORDER BY id ASC).
        Later: configurable via is_main flag or module.json.
        """
        async for session in get_db_sqlite():
            # Resolve module
            module = await CoreEngineLibPagesPublicService._resolve_module(
                session, module_name
            )
            if not module:
                return None

            # Find first active page
            stmt = (
                select(Page)
                .where(
                    Page.mod_id == module.id,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                .order_by(Page.id.asc())
                .limit(1)
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # PAGE BY DATETIME
    # ========================================

    @staticmethod
    async def get_by_datetime(
        date: str,
        time: str,
        module_name: str = DEFAULT_MODULE,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find page by date/time within a module.

        date = "20260914" (YYYYMMDD)
        time = "153910"   (HHMMSS)

        datetime in DB has microseconds (15:39:10.666406),
        so we search in range [dt_start, dt_start + 1 sec).

        Only returns active, non-deleted pages.
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError:
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            # Resolve module
            module = await CoreEngineLibPagesPublicService._resolve_module(
                session, module_name
            )
            if not module:
                return None

            # Find page
            stmt = select(Page).where(
                Page.mod_id == module.id,
                Page.datetime >= dt_start,
                Page.datetime < dt_end,
                Page.is_delete == 0,
                Page.is_active == 1,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # HELPERS
    # ========================================

    @staticmethod
    async def _resolve_module(session, module_name: str) -> Optional[Module]:
        """Resolve Module by name (active, non-deleted)."""
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    def _page_to_public(page: Page) -> CoreEngineLibPagesPublicItem:
        """Convert Page ORM object to public schema."""
        return CoreEngineLibPagesPublicItem(
            id=page.id,
            mod_id=page.mod_id,
            datetime=page.datetime,
            title=page.title,
            description=page.description,
            logo=page.logo,
            content=page.content,
        )