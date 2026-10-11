# neurocad/core/engine/lib/word/url.py

"""
Public-URL resolution for a page.

Public pages live on the owner's host, not on the technical host:

    https://<login>.<APP_DOMAIN>/page/<YYYYMMDD>/<HHMMSS>
    https://<custom-domain>/page/<YYYYMMDD>/<HHMMSS>

There is NO nav_id in the public URL — the owner is resolved from
the request Host, and the page is looked up within that user's
navs. See pages/public/route.py for the public route.

Two things are resolved here:

  - `build_public_url(page)` — the absolute public URL of a page.
    Used by the editor's "Open public version" button.

  - `resolve_nav_owner(nav_id)` — the user_id of the nav's owner.
    Used both by `build_public_url` (to look up the owner's host)
    and by the base word service (for tariff checks and similar).

A third helper is provided for callers that want the bare host
without parsing the URL again:

  - `public_host_from_url(url)` — returns the hostname from a URL
    string, or None on any error.

Namespace: CoreEngineLibWordUrl*
"""

from typing import Optional
from urllib.parse import urlparse

from sqlalchemy import select

from ....models.nav import Nav
from .....utils.sqlite import get_db_sqlite


async def resolve_nav_owner(nav_id: int) -> Optional[int]:
    """
    Return the user_id of the nav's owner, or None.

    Missing / soft-deleted navs return None. Never raises.
    """
    async for session in get_db_sqlite():
        stmt = select(Nav.user_id).where(
            Nav.id == nav_id,
            Nav.is_delete.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


def public_host_from_url(url: Optional[str]) -> Optional[str]:
    """
    Extract the hostname from an absolute URL.

    Returns None on an empty URL or any parse error. Kept here so
    both service.py and any future callers use the SAME extraction
    rule (urlparse, hostname, ignore scheme and path).
    """
    if not url:
        return None
    try:
        return urlparse(url).hostname or None
    except Exception:
        return None


async def build_public_url(page) -> Optional[str]:
    """
    Build the absolute public URL of a page.

    Returns None when:
      - the nav owner cannot be resolved (missing nav, deleted user);
      - get_public_base_url returns None (no APP_DOMAIN in settings
        and no custom domain — misconfiguration);
      - the page has no datetime (should not happen — page.datetime
        is NOT NULL — but we guard against it anyway).

    In all those cases the frontend falls back to a relative URL,
    which on the technical host will 404 — that is why the server-
    side path is preferred.
    """
    if not page.datetime:
        return None

    # Owner of the nav. Late import — the domain service pulls in
    # httpx/ssl/socket and models, which is heavy for the module
    # import time of word/service.py.
    user_id = await resolve_nav_owner(page.nav_id)
    if user_id is None:
        return None

    # Public base URL for this user (login.<APP_DOMAIN> or custom
    # domain). Reused from the domain service — the same value the
    # sitemap and the "Открыть каталог статей" button use.
    #
    # NOTE: the domain service was refactored from a single module
    # (domain/service.py) into a package (domain/service/), with
    # the facade class living in domain/service/facade.py. The old
    # import path (`..base.profile.domain.service`) no longer
    # resolves — see the domain/service/ package for details.
    from ..base.profile.domain.service.facade import (
        CoreEngineLibBaseProfileDomainService,
    )

    base = await CoreEngineLibBaseProfileDomainService.get_public_base_url(user_id)
    if not base:
        return None

    date = page.datetime.strftime("%Y%m%d")
    time = page.datetime.strftime("%H%M%S")
    return f"{base}/page/{date}/{time}"