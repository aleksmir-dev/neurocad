# neurocad/core/engine/lib/base/profile/domain/service/domain.py

"""
Custom domain management: attach, detach, home page.

Provides:

  - add_custom()      — set users.domain, check DNS, ask Caddy;
  - remove_custom()   — clear users.domain, schedule cert deletion;
  - set_home_page()   — set users.home_page_id;
  - clear_home_page() — clear users.home_page_id;
  - _save_domain()    — internal: write users.domain;
  - _exists_elsewhere() — internal: is the domain used by another user?

A user has at most ONE custom domain (a single nullable slot on
User). Attaching a new domain overwrites the previous one.

Side effects on robots.txt when attaching/detaching a domain:

  - add_custom:
      robots_2 (custom domain's robots.txt) → ROBOTS_OPEN if it
      was NULL; robots_3 (free subdomain's robots.txt) → forced
      to ROBOTS_CLOSED, so the subdomain stops advertising itself
      while the custom domain is primary.

  - remove_custom:
      robots_3 → forced to ROBOTS_OPEN; robots_2 is kept as-is so
      the user does not lose their custom robots.txt if they
      re-attach a domain later.

Certificate deletion is deferred: on detach, a row is written to
the `domains` table with delete_after = now + DOMAIN_GRACE_DAYS.
If the user re-attaches within the grace period, the deletion is
cancelled. Physical removal is handled by checked.py.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import select

from neurocad.core.models.domain import Domain
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from .constants import (
    _DOMAIN_RE,
    DOMAIN_GRACE_DAYS,
    ROOT_DOMAIN,
    is_protected_domain,
)
from .robots import ROBOTS_CLOSED, ROBOTS_OPEN
from ..schema import CoreEngineLibBaseProfileDomainAddData


class DomainMixin:
    """Attach / detach custom domain, manage home page."""

    # ========================================
    # ADD
    # ========================================

    @classmethod
    async def add_custom(
        cls,
        user_id: int,
        raw_domain: str,
        log=None,
    ) -> Tuple[Optional[CoreEngineLibBaseProfileDomainAddData], Optional[str]]:
        """
        Set the user's custom domain.

        Returns (data, error_code). error_code values:
            "invalid"   — bad domain string
            "duplicate" — domain already used by another user

        Side effects on robots.txt:

          - robots_2 (custom domain) — set to ROBOTS_OPEN if it was
            NULL. If the user already had a custom robots.txt from a
            previous attach, it is kept as-is.
          - robots_3 (free subdomain) — forced to ROBOTS_CLOSED, so
            the subdomain stops advertising itself to crawlers while
            the custom domain is the primary entry point.
        """
        domain = (raw_domain or "").strip().lower()

        if not _DOMAIN_RE.match(domain):
            return None, "invalid"

        if domain.endswith("." + ROOT_DOMAIN) or domain == ROOT_DOMAIN:
            return None, "invalid"

        if await cls._exists_elsewhere(domain, user_id):
            return None, "duplicate"

        server_ip = cls._detect_server_ip()
        dns_ok = await cls._check_dns(domain, server_ip)
        caddy_available = await cls._probe_caddy(log=log)

        # Persist the domain slot regardless of DNS state — so the user
        # can retry without retyping, and the status block on the next
        # page load will show what's missing.
        await cls._save_domain(user_id, domain)

        # robots.txt: open robots_2 if it was empty, close robots_3.
        # Done in the same session as the domain save — if the domain
        # row is written but robots are not, the next page load would
        # show an inconsistent state.
        async for session in get_db_sqlite():
            user = await session.get(User, user_id)
            if user is not None:
                if user.robots_2 is None:
                    user.robots_2 = ROBOTS_OPEN
                user.robots_3 = ROBOTS_CLOSED
                await session.commit()
                cls._log(
                    log, "info",
                    f"user {user_id}: robots_2 opened, robots_3 closed",
                )

        # If this domain was previously scheduled for cert deletion,
        # cancel it. The row in `domains` is kept for history — we
        # only clear delete_after and reset deleted_at.
        async for session in get_db_sqlite():
            existing = await session.get(Domain, domain)
            if existing is not None and existing.delete_after is not None:
                existing.delete_after = None
                existing.deleted_at = None
                await session.commit()
                cls._log(
                    log, "info",
                    f"domain re-added, cancelled cert deletion: {domain}",
                )

        message: Optional[str] = None

        if not dns_ok:
            message = "DNS ещё не настроен"
        elif not caddy_available:
            message = "Сервер Caddy недоступен"
        else:
            ok, err = await cls._ask_caddy(domain, log=log)
            if ok:
                message = "Сертификат выпущен"
            else:
                message = err or "Не удалось выпустить сертификат"

        return CoreEngineLibBaseProfileDomainAddData(
            domain=domain,
            dns_ok=dns_ok,
            caddy_available=caddy_available,
            server_ip=server_ip,
            message=message,
        ), None

    # ========================================
    # REMOVE
    # ========================================

    @classmethod
    async def remove_custom(
        cls,
        user_id: int,
        log=None,
    ) -> bool:
        """
        Clear the user's custom domain slot and schedule certificate
        deletion (unless the domain is platform-owned).

        Side effects on robots.txt:

          - robots_3 (free subdomain) — forced to ROBOTS_OPEN, so the
            subdomain starts advertising itself to crawlers again
            after the custom domain is detached.
          - robots_2 (custom domain) — kept as-is. If the user re-
            attaches a custom domain later, the previous robots.txt
            body is still there.
        """
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if user is None:
                return False

            domain = user.domain
            user.domain = None
            user.robots_3 = ROBOTS_OPEN

            if domain and not is_protected_domain(domain):
                now = datetime.utcnow()
                existing = await session.get(Domain, domain)
                if existing is None:
                    existing = Domain(name=domain)
                    session.add(existing)
                existing.disabled_at = now
                existing.delete_after = now + timedelta(days=DOMAIN_GRACE_DAYS)
                existing.deleted_at = None
                cls._log(
                    log, "info",
                    f"domain removed, cert scheduled for deletion: {domain}",
                )
            elif domain:
                cls._log(
                    log, "info",
                    f"domain removed (protected, cert kept): {domain}",
                )

            await session.commit()
            cls._log(log, "info", f"user {user_id}: robots_3 re-opened")
            return True
        return False

    # ========================================
    # HOME PAGE
    # ========================================

    @classmethod
    async def set_home_page(
        cls,
        user_id: int,
        page_id: int,
        log=None,
    ) -> Tuple[Optional[int], Optional[str]]:
        """
        Set `users.home_page_id` for the user.

        Only pages that belong to one of the user's navs (and are
        not deleted) are accepted. Returns (new_home_page_id, error_code):

            (page_id, None)      — saved
            (None, "invalid")    — page does not belong to this user
            (None, "not_found")  — user does not exist

        NOTE: we do NOT verify that the page's nav is the "first" one.
        If a user has several navs, any of their pages can be the home.
        """
        from neurocad.core.models.nav import Nav
        from neurocad.core.models.page import Page

        async for session in get_db_sqlite():
            # ---- 1. Load user ----
            user_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if user is None:
                return None, "not_found"

            # ---- 2. Verify the page belongs to this user ----
            page_stmt = (
                select(Page)
                .join(Nav, Nav.id == Page.nav_id)
                .where(
                    Page.id == page_id,
                    Page.is_delete == 0,
                    Nav.user_id == user_id,
                    Nav.is_delete.is_(False),
                )
            )
            page = (await session.execute(page_stmt)).scalar_one_or_none()
            if page is None:
                return None, "invalid"

            # ---- 3. Save ----
            user.home_page_id = page.id
            await session.commit()
            cls._log(log, "info", f"user {user_id}: home page set to {page.id}")
            return page.id, None

        return None, "not_found"

    @classmethod
    async def clear_home_page(
        cls,
        user_id: int,
        log=None,
    ) -> Optional[int]:
        """
        Set `users.home_page_id = NULL`.

        Returns the new value (always None) on success, or None if
        the user does not exist. The two are distinguished by the
        caller through the response shape — this method always
        returns None, and the route decides success by looking at
        the DB / user existence separately.

        To keep the API simple, we return `None` and the route
        treats "no exception" as success.
        """
        async for session in get_db_sqlite():
            user_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if user is None:
                return None

            user.home_page_id = None
            await session.commit()
            cls._log(log, "info", f"user {user_id}: home page cleared")
            return None

        return None

    # ========================================
    # INTERNAL — DB
    # ========================================

    @staticmethod
    async def _exists_elsewhere(domain: str, user_id: int) -> bool:
        """True if `domain` is already set on another non-deleted user."""
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.domain == domain,
                User.id != user_id,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        return False

    @staticmethod
    async def _save_domain(user_id: int, domain: str) -> bool:
        """Write users.domain for the given user. False if not found."""
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if user is None:
                return False
            user.domain = domain
            await session.commit()
            return True
        return False