# neurocad/core/engine/lib/base/profile/domain/service/pages.py

"""
Page-related helpers for the domain service.

Provides:

  - _page_public_url()      — module-level helper that builds
                              the public URL of a single page;
  - _list_pages_for_user()  — load the user's pages in datetime
                              ASC order, ready for the home-page
                              selector.

The public page URL scheme is /page/<YYYYMMDD>/<HHMMSS> — no
nav_id. Public URLs are host-based: the request Host resolves to
a user, and the page is looked up within that user's navs. See
pages/public/route.py for the public routing side.

The page list is used by the "Home page" selector on the domain
page; each item carries the pre-built public URL so the frontend
does not have to assemble it.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import List

from sqlalchemy import select

from neurocad.core.models.nav import Nav
from neurocad.core.models.page import Page
from neurocad.utils.sqlite import get_db_sqlite

from ..schema import CoreEngineLibBaseProfileDomainPageItem


def _page_public_url(page_dt) -> str:
    """
    Build the public page URL:
        /page/<YYYYMMDD>/<HHMMSS>

    NO nav_id — the public URL is host-based: the request Host
    resolves to a user, and the page is looked up within that
    user's navs. See pages/public/route.py.

    Returns a defensive fallback "/pages" when page_dt is None.
    page.datetime is NOT NULL in the model, so this branch should
    never fire; if it does, the caller gets a path that at least
    hits the catalog rather than a 500.
    """
    if page_dt is None:
        return "/pages"
    date = page_dt.strftime("%Y%m%d")
    time = page_dt.strftime("%H%M%S")
    return f"/page/{date}/{time}"


class PagesMixin:
    """Helpers for listing the user's pages."""

    @staticmethod
    async def _list_pages_for_user(
        user_id: int,
    ) -> List[CoreEngineLibBaseProfileDomainPageItem]:
        """
        Return the user's pages in `datetime ASC` order, ready for
        the "Home page" selector.

        Scope:
          - all pages of all of the user's non-deleted navs;
          - `is_delete = 0`.

        Each item carries the pre-built public URL
        (/page/<YYYYMMDD>/<HHMMSS>), so the frontend does not have
        to assemble it. NO nav_id in the URL — public URLs are
        host-based; see pages/public/route.py.
        """
        items: List[CoreEngineLibBaseProfileDomainPageItem] = []

        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .join(Nav, Nav.id == Page.nav_id)
                .where(
                    Nav.user_id == user_id,
                    Nav.is_delete.is_(False),
                    Page.is_delete == 0,
                )
                .order_by(Page.datetime.asc(), Page.id.asc())
            )
            rows = (await session.execute(stmt)).scalars().all()

            for page in rows:
                items.append(CoreEngineLibBaseProfileDomainPageItem(
                    id=page.id,
                    title=page.title or f"Страница #{page.id}",
                    datetime=page.datetime.isoformat() if page.datetime else None,
                    url=_page_public_url(page.datetime),
                ))
            break

        return items