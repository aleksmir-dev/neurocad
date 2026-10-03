# neurocad/utils/routes.py

from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select

from neurocad.core.route import router as core_router
from neurocad.core.engine.lib.pages.public.route import router as pages_public_router

# Internal routes — called by Caddy, not by end users.
# Lives at /internal/* — outside the /core/engine/... tree
# on purpose: Caddy's On-Demand TLS `ask` URL must be short
# and stable, not coupled to the profile module's prefix.
from neurocad.core.engine.lib.base.profile.domain.internal_route import (
    router as internal_tls_router,
)

from neurocad.config import settings


# ============================================
# ROBOTS.TXT DEFAULTS
# ============================================

# Must match ROBOTS_OPEN / ROBOTS_CLOSED in
# neurocad/core/engine/lib/base/profile/domain/service.py and
# DEFAULT_ROBOTS_CLOSED in the domain schema. If you change one,
# change all three — they are checked by the test suite.
ROBOTS_OPEN = "User-agent: *\nDisallow:\n"
ROBOTS_CLOSED = "User-agent: *\nDisallow: /\n"


# ============================================
# SUBDOMAIN HELPERS
# ============================================

def _slug_from_host(host: Optional[str]) -> Optional[str]:
    """
    Extract the user slug from a Host header.

    Returns the slug ("testuser3") when the host is a subdomain of
    settings.APP_DOMAIN ("testuser3.neurocad-dev.ru" with
    APP_DOMAIN=neurocad-dev.ru). Returns None otherwise.

    Guards:
      - host is empty / missing                      → None
      - port stripped, lowercased, trailing dot gone → canonical form
      - host == APP_DOMAIN (no subdomain)            → None
      - host is "www.<APP_DOMAIN>"                   → None
        ("www" is a web convention, not a user slug)
      - slug contains a dot ("a.b.<APP_DOMAIN>")     → None
        (only one level of subdomain is a user)
      - host does not end with ".<APP_DOMAIN>"       → None
    """
    if not host:
        return None

    host = host.strip().lower()
    if ":" in host:
        host = host.split(":", 1)[0]
    if host.endswith("."):
        host = host[:-1]
    if not host:
        return None

    root = (settings.APP_DOMAIN or "").strip().lower()
    if not root:
        return None

    # Exact root domain — not a subdomain.
    if host == root:
        return None

    suffix = "." + root
    if not host.endswith(suffix):
        return None

    slug = host[: -len(suffix)]
    if not slug:
        return None

    # "www" is a web convention, not a user slug.
    if slug == "www":
        return None

    # Only one level of subdomain. "a.b.example.com" is not a user.
    if "." in slug:
        return None

    return slug


def _normalize_host(host: Optional[str]) -> Optional[str]:
    """
    Shared host normalization for the custom-domain lookup:
    strip port, lowercase, drop the trailing dot.

    Returns None if the host is empty after normalization, or if it
    equals APP_DOMAIN / starts with "www." (those never belong to
    a custom-domain user — they are platform-hosted).
    """
    if not host:
        return None

    host = host.strip().lower()
    if ":" in host:
        host = host.split(":", 1)[0]
    if host.endswith("."):
        host = host[:-1]
    if not host:
        return None

    root = (settings.APP_DOMAIN or "").strip().lower()
    if root:
        if host == root:
            return None
        if host.endswith("." + root):
            # A subdomain of APP_DOMAIN — handled by _slug_from_host,
            # not by the custom-domain lookup.
            return None

    return host


async def _login_from_custom_domain(host: Optional[str]) -> Optional[str]:
    """
    If `host` is a custom domain registered by some user
    (users.domain == host), return that user's login. Otherwise None.

    This is the custom-domain counterpart of `_slug_from_host`:
    the subdomain lookup reads the login from the host
    ("testuser3.neurocad-dev.ru" → "testuser3"); the custom-domain
    lookup reads it from the database ("atou.ru" → "admin").

    Guards (all applied via _normalize_host):
      - empty / missing host                → None
      - host is APP_DOMAIN itself           → None
      - host is a subdomain of APP_DOMAIN   → None (handled earlier)

    Never raises on DB errors — treated as "not a custom domain".
    """
    normalized = _normalize_host(host)
    if not normalized:
        return None

    # Late imports — avoid pulling SQLAlchemy models at module import
    # time (this file is loaded very early by main.py).
    from neurocad.core.models.user import User
    from neurocad.utils.sqlite import get_db_sqlite

    try:
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.domain == normalized,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return None
            return user.login
    except Exception as e:
        print(f"[Engine] custom-domain lookup failed for {normalized!r}: {e}")
        return None

    return None


# ============================================
# ROBOTS.TXT HELPERS
# ============================================

def _robots_response(text: str) -> Response:
    """
    Build the /robots.txt response.

    Always text/plain; charset=utf-8. Never cached — robots.txt is
    edited by the user in the modal and cached responses would make
    the change invisible to crawlers (and to the user debugging).
    """
    return Response(
        content=text or ROBOTS_CLOSED,
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


async def _robots_for_slug(slug: str) -> str:
    """
    robots.txt body for a free third-level subdomain
    (<slug>.<APP_DOMAIN>).

    Source: users.robots_3. If the user does not exist or the field
    is NULL, ROBOTS_CLOSED is returned — the subdomain is closed to
    crawlers by default, and add_custom / remove_custom toggle this
    field automatically (see service.py).

    Never raises on DB errors — treated as "closed".
    """
    from neurocad.core.models.user import User
    from neurocad.utils.sqlite import get_db_sqlite

    try:
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.login == slug,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return ROBOTS_CLOSED
            return user.robots_3 or ROBOTS_CLOSED
    except Exception as e:
        print(f"[Engine] robots_3 lookup failed for {slug!r}: {e}")
        return ROBOTS_CLOSED

    return ROBOTS_CLOSED


async def _robots_for_custom_domain(host: str) -> str:
    """
    robots.txt body for a custom second-level domain.

    Source: users.robots_2, looked up by users.domain == host. If the
    user does not exist or the field is NULL, ROBOTS_CLOSED is
    returned — safer default for a domain that is registered but
    whose robots.txt has never been saved.

    Never raises on DB errors — treated as "closed".
    """
    from neurocad.core.models.user import User
    from neurocad.utils.sqlite import get_db_sqlite

    try:
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.domain == host,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return ROBOTS_CLOSED
            return user.robots_2 or ROBOTS_CLOSED
    except Exception as e:
        print(f"[Engine] robots_2 lookup failed for {host!r}: {e}")
        return ROBOTS_CLOSED

    return ROBOTS_CLOSED


async def _resolve_home_url_for_slug(slug: str) -> Optional[str]:
    """
    Given a user slug (login), return the URL of their home page —
    or a fallback URL if the user exists but has no pages.

    Resolution order:

      1. users.home_page_id — explicit choice made by the user on
         the "Custom domains" page.

      2. First page of the user's first nav (ORDER BY datetime ASC,
         is_delete = 0). This makes "/" always show something
         meaningful for a user who has at least one page.

      3. Fallback: /core/engine/pages — the article catalog, so
         the user can create their first page.

    Returns None if the user does not exist at all — the caller
    falls back to the Host → module resolution.

    The final URL uses the public "pages" route:
        /page/<nav_id>/<YYYYMMDD>/<HHMMSS>
    which is what the existing public router understands.
    """
    # Late imports — avoid pulling SQLAlchemy models at module import
    # time (this file is loaded very early by main.py).
    from neurocad.core.models.user import User
    from neurocad.core.models.nav import Nav
    from neurocad.core.models.page import Page
    from neurocad.utils.sqlite import get_db_sqlite

    async for session in get_db_sqlite():
        # ---- 1. Find the user ------------------------------------
        user_stmt = select(User).where(
            User.login == slug,
            User.is_delete.is_(False),
        )
        user = (await session.execute(user_stmt)).scalar_one_or_none()
        if user is None:
            return None

        # ---- 2. Find the user's first nav ------------------------
        nav_stmt = (
            select(Nav)
            .where(
                Nav.user_id == user.id,
                Nav.is_delete.is_(False),
            )
            .order_by(Nav.id.asc())
            .limit(1)
        )
        nav = (await session.execute(nav_stmt)).scalar_one_or_none()
        if nav is None:
            # User exists but has no nav — send them to the catalog
            # so they can create one (or see an empty state).
            return "/core/engine/pages"

        # ---- 3a. Explicit home page ------------------------------
        page: Optional[Page] = None
        if user.home_page_id:
            page_stmt = select(Page).where(
                Page.id == user.home_page_id,
                Page.nav_id == nav.id,
                Page.is_delete == 0,
            )
            page = (await session.execute(page_stmt)).scalar_one_or_none()
            # If the explicit home page was deleted or moved to
            # another nav, fall through to the "first page" branch.

        # ---- 3b. Fallback — first page by datetime ---------------
        if page is None:
            first_stmt = (
                select(Page)
                .where(
                    Page.nav_id == nav.id,
                    Page.is_delete == 0,
                )
                .order_by(Page.datetime.asc(), Page.id.asc())
                .limit(1)
            )
            page = (await session.execute(first_stmt)).scalar_one_or_none()

        if page is None:
            # Nav exists but has no pages — the user should create one.
            return "/core/engine/pages"

        # ---- 4. Build the public URL -----------------------------
        return _page_public_url(nav.id, page.datetime)

    return None


def _page_public_url(nav_id: int, page_dt) -> str:
    """
    Build the public page URL:
        /page/<nav_id>/<YYYYMMDD>/<HHMMSS>

    Matches what the public router expects and what the editor
    produces when it opens an article.
    """
    date = page_dt.strftime("%Y%m%d")
    time = page_dt.strftime("%H%M%S")
    return f"/page/{nav_id}/{date}/{time}"


# ============================================
# ROUTES
# ============================================

def setup_routes(app: FastAPI) -> None:
    """Register all application routes."""

    # Core routes — /core/*
    app.include_router(core_router)

    # Public pages — /pages/*
    app.include_router(pages_public_router)

    # Internal TLS verification — /internal/tls/verify
    # Called by Caddy before issuing an On-Demand TLS certificate.
    app.include_router(internal_tls_router)

    # /robots.txt — three-step resolution:
    #
    #   1. Host is a user subdomain (<login>.<APP_DOMAIN>):
    #        testuser3.neurocad-dev.ru → users.robots_3
    #      Default when the field is NULL: ROBOTS_CLOSED.
    #
    #   2. Host is a user's custom domain (users.domain):
    #        atou.ru → users.robots_2
    #      Default when the field is NULL: ROBOTS_CLOSED.
    #
    #   3. Anything else (apex APP_DOMAIN, IP, unknown host):
    #        ROBOTS_CLOSED. Never redirects, never serves HTML —
    #        crawlers must see a 200 text/plain response.
    @app.get("/robots.txt")
    async def robots_txt(request: Request):
        host = request.headers.get("host")

        # ---- Step 1: user subdomain ------------------------------
        slug = _slug_from_host(host)
        if slug is not None:
            text = await _robots_for_slug(slug)
            return _robots_response(text)

        # ---- Step 2: user custom domain --------------------------
        normalized = _normalize_host(host)
        if normalized is not None:
            custom_login = await _login_from_custom_domain(normalized)
            if custom_login is not None:
                text = await _robots_for_custom_domain(normalized)
                return _robots_response(text)

        # ---- Step 3: fallback ------------------------------------
        return _robots_response(ROBOTS_CLOSED)

    # Root — three-step resolution:
    #
    #   1. If Host is a user subdomain (<login>.<APP_DOMAIN>), redirect
    #      to that user's home page. The slug is read from the host:
    #        testuser3.neurocad-dev.ru → "testuser3"
    #
    #   2. If Host is a user's custom domain (users.domain), redirect
    #      to that user's home page. The login is read from the DB:
    #        atou.ru → owner's login → home page
    #
    #   3. Otherwise, redirect to the module resolved by Host via
    #      `domain` in the module's JSON. Fallback: APP_MAIN_PAGE.
    #
    # Set APP_MAIN_PAGE in .env to override the final fallback.
    @app.get("/")
    async def root(request: Request):
        host = request.headers.get("host")

        # ---- Step 1: user subdomain ------------------------------
        # e.g. testuser3.neurocad-dev.ru → "testuser3"
        slug = _slug_from_host(host)
        if slug is not None:
            target = await _resolve_home_url_for_slug(slug)
            if target is not None:
                return RedirectResponse(url=target, status_code=302)
            # slug was valid but user not found — fall through to
            # the module resolution below (e.g. a subdomain that
            # happens to be declared as a module domain).

        # ---- Step 2: user custom domain --------------------------
        # e.g. atou.ru → owner's login → home page
        custom_login = await _login_from_custom_domain(host)
        if custom_login is not None:
            target = await _resolve_home_url_for_slug(custom_login)
            if target is not None:
                return RedirectResponse(url=target, status_code=302)
            # Custom domain is registered, but the owner has no
            # home page / no pages — fall through to module resolution.

        # ---- Step 3: Host → module -------------------------------
        from neurocad.core.engine.route import _resolve_module_by_host

        host_module = _resolve_module_by_host(host)
        if host_module:
            return RedirectResponse(url=f"/core/engine/{host_module}")

        # ---- Step 4: fallback ------------------------------------
        main_url = settings.APP_MAIN_PAGE
        if not main_url or main_url == "/":
            main_url = "/core/engine/admin"
        return RedirectResponse(url=main_url)