# neurocad/core/engine/lib/pages/public/hosts.py

"""
Host-ownership and nav-resolution helpers for the public routes.

Every public page and the catalog are scoped to the OWNER of the
request Host. Without this check, ANY subdomain of APP_DOMAIN —
or the bare APP_DOMAIN itself — would happily serve any nav from
the DB, producing duplicate content across domains (bad for SEO)
and leaking pages across users.

This module owns the whole resolution layer:

  - enforce_host_owner()          — the guard itself;
  - resolve_nav_owner()           — who owns a nav;
  - resolve_nav_name()            — display name of a nav;
  - resolve_first_nav_id_for_user() — a user's first nav;
  - resolve_first_nav_id()        — the very first nav in the DB.

These five functions sit between route.py (which decides WHAT to
render) and service.py (which reads the page/catalog rows). They
only touch `navs` and `users` — the page rows themselves are the
service's job.

Why the check is 404, not 403
-----------------------------
Leaking "this page exists but is not yours" is worse than
pretending it does not exist. Crawlers and casual visitors see
the same thing either way; the owner sees their own page as
normal. See enforce_host_owner() for the exact rules.

Why the fallbacks exist
-----------------------
- Unknown host → first nav in the DB is used as a fallback so the
  subsequent host-ownership check can reject it with a 404 (rather
  than the caller turning an unknown host into a 404 with a
  different message). Both are 404, but "Page not found" is what a
  probe should see.
- User subdomain / custom domain → first nav of that user. A user
  can theoretically own several navs; the public URL scheme does
  not carry nav_id, so the first one is used. If a future scheme
  needs "the nav of this page", the caller passes it explicitly.

Namespace: CoreEngineLibPagesPublicHosts*
"""

from typing import Optional

from fastapi import HTTPException, Request
from sqlalchemy import select

from neurocad.utils.sqlite import get_db_sqlite

# Host → user resolution. Shared with utils/routes.py so that
# "/" handlers and public page handlers apply exactly the same
# rules. See neurocad/utils/hosts.py.
from neurocad.utils.hosts import is_dev_host, user_id_from_host

from neurocad.core.models.nav import Nav


# ============================================
# HOST OWNERSHIP CHECK
# ============================================

async def enforce_host_owner(
    request: Request,
    nav_id: int,
) -> None:
    """
    Ensure the request Host may serve pages of the given nav.

    Raises HTTPException(404) if the Host is not the nav owner's.

    Called AFTER the nav has been resolved — either from the Host
    itself (public routes) or from an explicit ?nav_id= (legacy /
    admin-provided links). The check is the last line of defence:
    even if a nav_id somehow got into the request, only the host
    that owns that nav may see it.

    Rules:
      - Dev host (localhost, 127.0.0.1, [::1]) → allow any nav_id.
        Local development has no APP_DOMAIN and no user subdomains.
      - Host resolves to a user → that user must own the nav.
      - Host does not resolve to a user → 404.

    The 404 (not 403) is deliberate: leaking "this page exists but
    is not yours" is worse than pretending it does not exist.
    Crawlers and casual visitors see the same thing either way.

    This function is the single entry point for the rule — the
    public routes call it once, after resolving the nav. Any future
    public route (e.g. /feed.xml) should do the same.
    """
    host = request.headers.get("host")

    # ---- 1. Dev hosts — skip the check ----
    if is_dev_host(host):
        return

    # ---- 2. Resolve Host to a user ----
    host_user_id = await user_id_from_host(host)
    if host_user_id is None:
        # Bare APP_DOMAIN with no owner, www., random domain,
        # unknown subdomain. Nothing personal is served here.
        raise HTTPException(status_code=404, detail="Page not found")

    # ---- 3. Nav must belong to the Host user ----
    nav_owner_id = await resolve_nav_owner(nav_id)
    if nav_owner_id is None or nav_owner_id != host_user_id:
        raise HTTPException(status_code=404, detail="Page not found")


# ============================================
# NAV OWNER / NAV NAME
# ============================================

async def resolve_nav_owner(nav_id: int) -> Optional[int]:
    """
    Return the user_id of the nav's owner, or None.

    A missing nav or a soft-deleted one yields None — the caller
    treats that as "the Host does not own this nav" and returns
    404. Never raises.
    """
    async for session in get_db_sqlite():
        stmt = select(Nav.user_id).where(
            Nav.id == nav_id,
            Nav.is_delete.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


async def resolve_nav_name(nav_id: int) -> Optional[str]:
    """
    Return Nav.name for the given nav, or None.

    Used as the /pages catalog title and H1. When empty or missing,
    the caller falls back to PUBLIC_CATALOG_DEFAULT_TITLE
    ("Каталог статей"). Nav.name is edited from the admin catalog
    via PUT /core/engine/lib/pages/nav-name.
    """
    async for session in get_db_sqlite():
        stmt = select(Nav.name).where(
            Nav.id == nav_id,
            Nav.is_delete.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


# ============================================
# NAV RESOLUTION — first nav
# ============================================

async def resolve_first_nav_id_for_user(user_id: int) -> Optional[int]:
    """
    Return the first non-deleted nav id of the given user
    (ORDER BY id ASC), or None.

    Public URLs are host-based and do not carry a nav_id. When a
    user owns several navs, the first one is served — same choice
    the admin tooling makes for the "Open public version" button.
    A future scheme that needs a specific nav can pass it
    explicitly; this helper stays the deterministic fallback.
    """
    async for session in get_db_sqlite():
        stmt = (
            select(Nav.id)
            .where(Nav.user_id == user_id, Nav.is_delete.is_(False))
            .order_by(Nav.id.asc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


async def resolve_first_nav_id() -> Optional[int]:
    """
    Return the first non-deleted nav id (ORDER BY id ASC), or None.

    Used in two cases:

      - dev host: /pages and /page/<date>/<time> are served against
        the first nav in the DB so a developer sees something
        locally without setting up a user subdomain;

      - unknown host: the fallback nav is returned so the caller's
        enforce_host_owner() can reject it with a 404. Returning
        None here would turn an unknown host into a 404 with a
        different message; "Page not found" is what a probe should
        see.
    """
    async for session in get_db_sqlite():
        stmt = (
            select(Nav.id)
            .where(Nav.is_delete.is_(False))
            .order_by(Nav.id.asc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None