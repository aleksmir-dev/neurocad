# neurocad/core/engine/lib/base/profile/domain/service/sitemap.py

"""
Sitemap generation for the domain service.

Provides:

  - build_sitemap()          — build a sitemap.xml string for a user;
  - _empty_sitemap()         — a well-formed sitemap with no entries;
  - _iso_z()                 — W3C datetime for <lastmod>;
  - _absolute_page_url()     — absolute URL of a single page;
  - _xml_escape()            — XML-escape a string;
  - _render_sitemap()        — serialize (loc, lastmod) tuples to XML.

The sitemap is generated on the fly from the `pages` table. NOTHING
IS STORED — the DB is the single source of truth, so adding,
editing or deleting a page requires no cache invalidation and no
static file regeneration.

Both the public endpoint (on the user's own domain, XML) and the
admin endpoint (for the in-admin modal viewer, text/plain) call
build_sitemap(). The XML string is byte-identical in both cases;
only the Content-Type and cache headers differ (see route.py and
utils/routes.py).

Namespace: CoreEngineLibBaseProfileDomain*
"""

from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import select

from neurocad.core.models.nav import Nav
from neurocad.core.models.page import Page
from neurocad.utils.sqlite import get_db_sqlite

from .pages import _page_public_url


class SitemapMixin:
    """Build sitemap.xml for one user, on the fly."""

    # ========================================
    # BUILD
    # ========================================

    @classmethod
    async def build_sitemap(cls, user_id: int) -> str:
        """
        Build a sitemap.xml string for the given user.

        Layout:

            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url>
                <loc>https://user.domain/path</loc>
                <lastmod>2026-10-04T01:10:46+00:00</lastmod>
              </url>
              ...
            </urlset>

        Entries:
          - "/" — always, with lastmod = newest page's updated_at
            (omitted if the user has no pages);
          - one <url> per non-deleted page, in datetime ASC order;
          - <lastmod> from pages.updated_at (falls back to datetime).

        Page URLs are /page/<YYYYMMDD>/<HHMMSS> — no nav_id. The
        public URL scheme is host-based, see pages/public/route.py.
        """
        base = await cls.get_public_base_url(user_id)
        if not base:
            # No public host — return a valid empty sitemap rather
            # than an error, so both the browser and search-engine
            # crawlers see well-formed XML.
            return cls._empty_sitemap()

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

            urls: List[Tuple[str, Optional[str]]] = []

            # ---- Site root ----
            # lastmod = newest page datetime, or omit the tag.
            newest: Optional[datetime] = None
            for page in rows:
                dt = getattr(page, "updated_at", None) or getattr(page, "datetime", None)
                if dt and (newest is None or dt > newest):
                    newest = dt

            urls.append((f"{base}/", cls._iso_z(newest) if newest else None))

            # ---- One entry per page ----
            for page in rows:
                loc = cls._absolute_page_url(base, page)
                if not loc:
                    continue
                dt = getattr(page, "updated_at", None) or getattr(page, "datetime", None)
                urls.append((loc, cls._iso_z(dt) if dt else None))

            return cls._render_sitemap(urls)

        return cls._empty_sitemap()

    # ========================================
    # HELPERS
    # ========================================

    @staticmethod
    def _empty_sitemap() -> str:
        """A well-formed sitemap with no <url> entries."""
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            '</urlset>\n'
        )

    @staticmethod
    def _iso_z(dt: datetime) -> str:
        """
        W3C datetime for <lastmod>. Sitemaps accept both
        "YYYY-MM-DD" and full ISO-8601; we emit the full form with
        an explicit timezone.

        SQLite stores naive datetimes — we treat them as UTC, which
        is what the app writes (datetime.utcnow / datetime.now on a
        UTC server). If a datetime carries tzinfo, we honor it.
        """
        if dt.tzinfo is None:
            return dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        return dt.astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")

    @classmethod
    def _absolute_page_url(cls, base: str, page) -> Optional[str]:
        """
        Public absolute URL of a single page on the user's domain.

        Format:
            <base>/page/<YYYYMMDD>/<HHMMSS>

        NO nav_id — the public URL is host-based: the request Host
        resolves to a user, and the page is looked up within that
        user's navs. See pages/public/route.py.

        Returns None if the page has no datetime — that should not
        happen (page.datetime is NOT NULL in the model), but we
        skip rather than emit a malformed URL.
        """
        if page.datetime is None:
            return None
        date = page.datetime.strftime("%Y%m%d")
        time = page.datetime.strftime("%H%M%S")
        return f"{base}/page/{date}/{time}"

    @staticmethod
    def _xml_escape(s: str) -> str:
        """Escape text for use inside an XML element."""
        return (
            str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    @classmethod
    def _render_sitemap(cls, urls: List[Tuple[str, Optional[str]]]) -> str:
        """
        Serialize (loc, lastmod) tuples into a sitemap.xml string.

        lastmod may be None — in that case the tag is omitted. Both
        forms are valid for search engines; omitting is cleaner than
        emitting an empty <lastmod/>.
        """
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        for loc, lastmod in urls:
            lines.append("  <url>")
            lines.append(f"    <loc>{cls._xml_escape(loc)}</loc>")
            if lastmod:
                lines.append(f"    <lastmod>{lastmod}</lastmod>")
            lines.append("  </url>")
        lines.append("</urlset>")
        return "\n".join(lines) + "\n"