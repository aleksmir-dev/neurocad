# neurocad/utils/hosts.py

"""
Host-header utilities — single source of truth for parsing the
public host and resolving it to a user.

The same logic is needed in three places:

  - utils/routes.py            — "/" and "/robots.txt" handlers;
  - pages/public/route.py      — "/page/..." and "/pages" handlers;
  - (potentially) anything else that needs "who owns this host".

Before this module existed, the resolution logic was duplicated
in routes.py and quietly diverged. Now every caller imports from
here, and changes (e.g. adding a new reserved subdomain) only
need to be made once.

Two concepts:

  normalize_host(host)
      Canonical form of a Host header: lowercase, port stripped,
      trailing dot removed. Returns None for empty / None input.

  slug_from_host(host)
      The "user slug" part of a subdomain of APP_DOMAIN.
      testuser3.neurocad-dev.ru → "testuser3"
      Returns None for: empty host, APP_DOMAIN itself, "www",
      multi-level subdomains ("a.b.example.com"), non-APP_DOMAIN.

  login_from_custom_domain(host)
      Reverse lookup: which user has users.domain == host.
      atou.ru → "admin"
      Returns None for empty host, APP_DOMAIN itself, subdomains
      of APP_DOMAIN (those are handled by slug_from_host), and
      any host with no matching user.

  user_id_from_host(host)
      Convenience wrapper: tries subdomain first, then custom
      domain; returns the resolved user's id, or None if the
      host does not belong to any user.

  is_dev_host(host)
      True for local development hosts (localhost, 127.0.0.1,
      [::1]). Used by pages/public/route.py to allow any nav_id
      during local development, where there is no APP_DOMAIN.

All functions NEVER raise on DB errors — a DB hiccup is treated
as "this host does not belong to any user", and the caller falls
through to its own default. This keeps the public routes from
500-ing when the DB is briefly unavailable.

Namespace: neurocad.utils.hosts
"""

from typing import Optional

from sqlalchemy import select

from neurocad.config import settings


# ============================================
# NORMALIZE
# ============================================

def normalize_host(host: Optional[str]) -> Optional[str]:
    """
    Canonical form of a Host header.

      - strips the port (":8080")
      - lowercases
      - strips one trailing dot ("example.com." → "example.com")

    Returns None if the result is empty, or if the host is the
    APP_DOMAIN itself (the platform's bare domain is never a user
    host). Subdomains of APP_DOMAIN are returned as-is — the
    caller decides whether they mean a user subdomain (via
    slug_from_host) or something else.
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
        # Subdomains of APP_DOMAIN are kept — the caller decides
        # what to do with them (slug_from_host handles the user
        # subdomain case).
        if host.endswith("." + root):
            return host

    return host


# ============================================
# SUBDOMAIN → LOGIN
# ============================================

def slug_from_host(host: Optional[str]) -> Optional[str]:
    """
    Extract the user slug from a subdomain of APP_DOMAIN.

        testuser3.neurocad-dev.ru → "testuser3"
        neurocad-dev.ru           → None (APP_DOMAIN itself)
        www.neurocad-dev.ru       → None ("www" is not a user slug)
        a.b.neurocad-dev.ru       → None (only one level)
        example.com               → None (not a subdomain of APP_DOMAIN)

    Returns the slug (login) when the host is a valid user
    subdomain, or None otherwise.
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

    # Only one level of subdomain: "a.b.example.com" is not a user.
    if "." in slug:
        return None

    return slug


# ============================================
# CUSTOM DOMAIN → LOGIN
# ============================================

async def login_from_custom_domain(
    host: Optional[str],
) -> Optional[str]:
    """
    Reverse lookup: which user has users.domain == host.

    The custom-domain counterpart of slug_from_host: the subdomain
    lookup reads the login from the host, this one reads it from
    the database.

    Guards (all applied via normalize_host):
      - empty / missing host              → None
      - host is APP_DOMAIN itself         → None
      - host is a subdomain of APP_DOMAIN → None (handled earlier)

    Never raises on DB errors — treated as "not a custom domain".
    """
    normalized = normalize_host(host)
    if not normalized:
        return None

    # Late import — avoid pulling SQLAlchemy models at module
    # import time (hosts.py is loaded early, by utils/routes.py).
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
        print(f"[hosts] custom-domain lookup failed for {normalized!r}: {e}")
        return None

    return None


# ============================================
# HOST → USER_ID
# ============================================

async def user_id_from_host(host: Optional[str]) -> Optional[int]:
    """
    Resolve a Host header to the owning user's id.

    Tries in order:
      1. slug_from_host(host) — subdomain of APP_DOMAIN → user by login;
      2. login_from_custom_domain(host) → user by domain.

    Returns None if neither path matched — that means the host does
    not belong to any user, and the caller should treat it as a
    "technical" host (the platform's bare domain, a random domain
    pointed at us, etc.).

    Never raises on DB errors.
    """
    if not host:
        return None

    # ---- 1. Subdomain path ----
    slug = slug_from_host(host)
    if slug:
        user_id = await _user_id_by_login(slug)
        if user_id is not None:
            return user_id

    # ---- 2. Custom-domain path ----
    login = await login_from_custom_domain(host)
    if login:
        return await _user_id_by_login(login)

    return None


async def _user_id_by_login(login: str) -> Optional[int]:
    """SELECT users.id WHERE login = ? AND is_delete = 0."""
    from neurocad.core.models.user import User
    from neurocad.utils.sqlite import get_db_sqlite

    try:
        async for session in get_db_sqlite():
            stmt = select(User.id).where(
                User.login == login,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
    except Exception as e:
        print(f"[hosts] user lookup by login failed for {login!r}: {e}")
        return None

    return None


# ============================================
# DEV HOSTS
# ============================================

def is_dev_host(host: Optional[str]) -> bool:
    """
    True if the host is a local development address.

    Used by pages/public/route.py: during local development there
    is no APP_DOMAIN and no user subdomains, so any nav_id is
    allowed when the host is localhost / 127.0.0.1 / [::1].

    On prod these hosts never appear in real traffic, so this
    branch is effectively dev-only. If a malicious client sets
    Host: localhost on a request to the prod server, the route
    will still resolve it as a dev host — but the response is
    served from the same DB, with the same auth — no security
    boundary is crossed. The only effect is a missing
    cross-domain check, which is harmless for a dev scenario.
    """
    if not host:
        return False

    h = host.strip().lower()
    if ":" in h:
        h = h.split(":", 1)[0]
    if h.endswith("."):
        h = h[:-1]

    return h in ("localhost", "127.0.0.1", "::1", "[::1]")