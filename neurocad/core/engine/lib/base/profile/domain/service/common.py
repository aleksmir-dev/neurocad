# neurocad/core/engine/lib/base/profile/domain/service/common.py

"""
Common helpers shared by all mixins in the service/ package.

This mixin provides:

  - _log()                — safe logging wrapper (no-op if log is None);
  - _load_user()          — load a non-deleted User by id;
  - get_public_base_url() — public base URL of a user's site
                            (custom domain if set, otherwise
                            https://<login>.<ROOT_DOMAIN>);
  - _build_subdomain()    — build the free third-level subdomain
                            object from a user login;
  - get_for_user()        — read the full domain-page payload for
                            one user (subdomain, custom slot, Caddy
                            status, pages, home_page_id, robots_2,
                            robots_3, pages_url, policy, rules,
                            policy_default, rules_default).

get_for_user is the assembly point of the whole service: it calls
into almost every other mixin (dns, caddy, pages, robots, legal)
and returns the Pydantic model that the /domain/ endpoint
serializes.

Namespace: CoreEngineLibBaseProfileDomain*
"""

import re
from typing import Optional

from sqlalchemy import select

from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from .constants import ROOT_DOMAIN
from .robots import ROBOTS_CLOSED

# Import the schema classes used by _build_subdomain and
# get_for_user. Kept here (and not in constants.py) because they
# are Pydantic models, not plain constants — see schema.py.
from ..schema import (
    CoreEngineLibBaseProfileDomainSubdomain,
    CoreEngineLibBaseProfileDomainCustom,
    CoreEngineLibBaseProfileDomainData,
    DOMAIN_STATUS_NONE,
    DOMAIN_STATUS_ACTIVE,
    DOMAIN_STATUS_DNS_FAIL,
    DOMAIN_STATUS_CADDY_OFF,
)


class CommonMixin:
    """Shared helpers: logging, user loading, public base URL, subdomain."""

    # ========================================
    # LOG
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        """
        Safe logging wrapper.

        Does nothing if `log` is None, if the requested log_<level>_sync
        method is missing, or if the method itself raises. Logging must
        never break the caller.
        """
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="domain", message=message)
        except Exception:
            pass

    # ========================================
    # LOAD USER
    # ========================================

    @staticmethod
    async def _load_user(user_id: int) -> Optional[User]:
        """Load a non-deleted User by id. Returns None if not found."""
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
        return None

    # ========================================
    # PUBLIC BASE URL
    # ========================================

    @classmethod
    async def get_public_base_url(cls, user_id: int) -> Optional[str]:
        """
        Public base URL of the user's site (no trailing slash).

        Rules:
          - custom second-level domain (users.domain) → https://<domain>;
          - otherwise → https://<login>.<ROOT_DOMAIN>.

        Returns None if the user does not exist or has no login.

        Used by:
          - build_sitemap() — to prefix <loc> entries;
          - get_for_user()  — to build `pages_url` (catalog URL);
          - the pages module on the frontend — via GET /domain/
            (`pages_url` field), for the "Open article catalog"
            button. That button must be an absolute URL pointing at
            the user's own host, not a relative "/pages" which would
            resolve against the admin host during impersonation.
        """
        async for session in get_db_sqlite():
            user = await session.get(User, user_id)
            if user is None or user.is_delete:
                return None
            if not user.login:
                return None

            custom = (getattr(user, "domain", None) or "").strip()
            if custom:
                if custom.startswith("http://") or custom.startswith("https://"):
                    return custom.rstrip("/")
                return f"https://{custom}".rstrip("/")

            return f"https://{user.login}.{ROOT_DOMAIN}".rstrip("/")

        return None

    # ========================================
    # SUBDOMAIN
    # ========================================

    @staticmethod
    def _build_subdomain(login: str) -> CoreEngineLibBaseProfileDomainSubdomain:
        """
        Build the free third-level subdomain from the user login.

        Since logins are validated at registration (>= 8 chars),
        system hosts (www, api, dev, admin, ...) can never collide
        with a user subdomain. No reserved list needed.
        """
        slug = (login or "").strip().lower()
        slug = slug.replace("_", "-")
        slug = re.sub(r"[^a-z0-9-]+", "-", slug).strip("-")
        if not slug:
            slug = "user"

        return CoreEngineLibBaseProfileDomainSubdomain(
            login=login or "",
            subdomain=f"{slug}.{ROOT_DOMAIN}",
            root_domain=ROOT_DOMAIN,
        )

    # ========================================
    # READ — FULL PAYLOAD FOR /domain/
    # ========================================

    @classmethod
    async def get_for_user(
        cls,
        user_id: int,
        login: str,
        log=None,
    ) -> CoreEngineLibBaseProfileDomainData:
        """
        Read the subdomain + custom domain slot + Caddy availability
        + the user's pages and home page id + robots_2 / robots_3
        + the absolute public URL of the article catalog (pages_url)
        + the user's policy / rules markdown texts
        + the universal fallback texts for both.

        This is the assembly point for GET /domain/ — every other
        read helper feeds into it.

        policy / rules semantics:
          - NULL in the DB → None in the payload. The frontend then
            opens the modal with `policy_default` / `rules_default`
            as the starting text and marks it as "this is the
            fallback, not your text".
          - "" in the DB → "" in the payload. Same as NULL from the
            frontend's point of view; the DB keeps the two distinct.
          - Neither is substituted with a default here — that is
            done by the frontend (see modals.js → openLegalModal)
            and by the public endpoints (see public.py). We only
            send the fallback text as separate fields.

        policy_default / rules_default:
          - Always read from disk (modal/legal/policy.md and
            modal/legal/rules.md) by LegalMixin.get_defaults().
          - {date} is already substituted with today's ISO date.
          - Never None — a missing file yields a short inline
            fallback (see public.read_default).
        """
        user = await cls._load_user(user_id)
        subdomain = cls._build_subdomain(login)
        server_ip = cls._detect_server_ip()
        caddy_available = await cls._probe_caddy(log=log)

        custom_domain = user.domain if user else None
        custom_status = DOMAIN_STATUS_NONE
        custom_message: Optional[str] = None

        if custom_domain:
            dns_ok = await cls._check_dns(custom_domain, server_ip)
            if not dns_ok:
                custom_status = DOMAIN_STATUS_DNS_FAIL
                custom_message = "A-запись домена не указывает на наш сервер"
            elif not caddy_available:
                custom_status = DOMAIN_STATUS_CADDY_OFF
                custom_message = "Сервер Caddy недоступен"
            else:
                custom_status = DOMAIN_STATUS_ACTIVE
                custom_message = None

        # Pages for the "Home page" selector.
        pages = await cls._list_pages_for_user(user_id)

        home_page_id: Optional[int] = user.home_page_id if user else None

        # If the stored home_page_id no longer points at a live page
        # (e.g. the page was deleted, or it lives in another nav),
        # treat it as "not set". The selector then shows the first
        # page as the effective home, matching utils/routes.py.
        if home_page_id is not None:
            page_ids = {p.id for p in pages}
            if home_page_id not in page_ids:
                home_page_id = None

        # robots_2 / robots_3 — NULL in the DB means "user never
        # opened the modal for this field". Serve the default
        # "closed" body in that case so the frontend always has a
        # non-empty textarea to open.
        robots_2 = (user.robots_2 if user and user.robots_2 else None) or ROBOTS_CLOSED
        robots_3 = (user.robots_3 if user and user.robots_3 else None) or ROBOTS_CLOSED

        # policy / rules — NULL or "" means "user has no text".
        # Pass through as-is; the frontend substitutes the default
        # when opening the modal, and the public endpoints do the
        # same when serving the page.
        policy = user.policy if user else None
        rules  = user.rules  if user else None

        # Default fallback texts — the same ones the public /policy
        # and /rules endpoints serve when the field is empty. Sent
        # to the frontend so the legal modal can seed its textarea
        # with the fallback and show an explanatory hint.
        defaults = cls.get_defaults()
        policy_default = defaults["policy"]
        rules_default = defaults["rules"]

        # Absolute public URL of the article catalog on the OWNER's
        # public host. Built from the same base as the sitemap:
        #   https://<login>.<ROOT_DOMAIN>/pages
        #   https://<custom-domain>/pages
        #
        # Consumed by pages.js → _loadPublicPagesUrl() so the
        # "Open article catalog" toolbar button opens the catalog
        # on the user's own public domain (not the admin host).
        #
        # None when the base URL cannot be resolved — the frontend
        # then falls back to a relative "/pages", which resolves
        # against the current admin host (usually not what we want).
        base = await cls.get_public_base_url(user_id)
        pages_url = f"{base}/pages" if base else None

        return CoreEngineLibBaseProfileDomainData(
            subdomain=subdomain,
            custom=CoreEngineLibBaseProfileDomainCustom(
                domain=custom_domain,
                status=custom_status,
                message=custom_message,
            ),
            caddy_available=caddy_available,
            server_ip=server_ip,
            pages=pages,
            home_page_id=home_page_id,
            robots_2=robots_2,
            robots_3=robots_3,
            pages_url=pages_url,
            policy=policy,
            rules=rules,
            policy_default=policy_default,
            rules_default=rules_default,
        )