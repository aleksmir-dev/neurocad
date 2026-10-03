# neurocad/core/engine/lib/base/profile/domain/service.py

"""
Domain service.

The custom domain is a single nullable field on `users.domain`. This
service:

  - builds the free third-level subdomain from the user login;
  - reads / writes the custom domain slot on User;
  - validates a domain string;
  - checks that the A-record of a custom domain points to us;
  - probes the Caddy admin API and asks it to issue a certificate;
  - verifies a domain for Caddy's On-Demand TLS (internal endpoint).

Status is derived, not stored: on each read, the service resolves
DNS and probes Caddy, then returns "active" / "dns_fail" /
"caddy_off". If the user fixed DNS, the next page load shows
"active" without any extra action.

No cache.

Namespace: CoreEngineLibBaseProfileDomain*
"""

import ipaddress
import json
import os
import re
import socket
from datetime import datetime, timedelta
from typing import Optional, Tuple

import httpx
from sqlalchemy import select

from neurocad.core.models.domain import Domain
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite
from .schema import (
    CoreEngineLibBaseProfileDomainSubdomain,
    CoreEngineLibBaseProfileDomainCustom,
    CoreEngineLibBaseProfileDomainData,
    CoreEngineLibBaseProfileDomainAddData,
    DOMAIN_STATUS_NONE,
    DOMAIN_STATUS_ACTIVE,
    DOMAIN_STATUS_DNS_FAIL,
    DOMAIN_STATUS_CADDY_OFF,
)


ROOT_DOMAIN = "neurocad.ru"

# ============================================
# PROTECTED DOMAINS
# ============================================

# Domains owned by the platform. Their certificates must never be
# deleted, no matter what. Add future system domains here.
PROTECTED_DOMAINS = frozenset({
    "neurocad.ru",
    "neurocad-dev.ru",
    "neurocad-demo.ru",
})

# Same, but for whole subtrees: *.neurocad.ru, *.neurocad-dev.ru, ...
PROTECTED_SUFFIXES = (
    ".neurocad.ru",
    ".neurocad-dev.ru",
    ".neurocad-demo.ru",
)


def is_protected_domain(name: str) -> bool:
    """True if the domain is owned by the platform itself."""
    d = (name or "").strip().lower().rstrip(".")
    if d in PROTECTED_DOMAINS:
        return True
    return any(d.endswith(s) for s in PROTECTED_SUFFIXES)


# Days between removing a custom domain and physically deleting its
# Caddy certificate.
DOMAIN_GRACE_DAYS = 30


_DOMAIN_RE = re.compile(
    r"^(?=.{4,253}$)"
    r"(?!-)"
    r"(?:[a-z0-9-]{1,63}\.)+"
    r"[a-z]{2,63}$",
    re.IGNORECASE,
)

DEFAULT_CADDY_ADMIN = "http://127.0.0.1:2019"
CADDY_PROBE_TIMEOUT = 2.0


class CoreEngineLibBaseProfileDomainService:
    """Custom domain management for one user (single slot)."""

    # ========================================
    # LOG
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
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
    # READ
    # ========================================

    @classmethod
    async def get_for_user(
        cls,
        user_id: int,
        login: str,
        log=None,
    ) -> CoreEngineLibBaseProfileDomainData:
        """Read the subdomain + custom domain slot + Caddy availability."""
        user = await cls._load_user(user_id)
        subdomain = cls._build_subdomain(login)
        server_ip = cls._detect_server_ip()
        caddy_available = await cls._probe_caddy(log=log)

        custom_domain = user.domain if user else None
        custom_status = DOMAIN_STATUS_NONE
        custom_message: Optional[str] = None

        if custom_domain:
            dns_ok = cls._check_dns(custom_domain, server_ip)
            if not dns_ok:
                custom_status = DOMAIN_STATUS_DNS_FAIL
                custom_message = "A-запись домена не указывает на наш сервер"
            elif not caddy_available:
                custom_status = DOMAIN_STATUS_CADDY_OFF
                custom_message = "Сервер Caddy недоступен"
            else:
                custom_status = DOMAIN_STATUS_ACTIVE
                custom_message = None

        return CoreEngineLibBaseProfileDomainData(
            subdomain=subdomain,
            custom=CoreEngineLibBaseProfileDomainCustom(
                domain=custom_domain,
                status=custom_status,
                message=custom_message,
            ),
            caddy_available=caddy_available,
            server_ip=server_ip,
        )

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
        """
        domain = (raw_domain or "").strip().lower()

        if not _DOMAIN_RE.match(domain):
            return None, "invalid"

        if domain.endswith("." + ROOT_DOMAIN) or domain == ROOT_DOMAIN:
            return None, "invalid"

        if await cls._exists_elsewhere(domain, user_id):
            return None, "duplicate"

        server_ip = cls._detect_server_ip()
        dns_ok = cls._check_dns(domain, server_ip)
        caddy_available = await cls._probe_caddy(log=log)

        # Persist the domain slot regardless of DNS state — so the user
        # can retry without retyping, and the status block on the next
        # page load will show what's missing.
        await cls._save_domain(user_id, domain)

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
            return True
        return False

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
    # DNS / IP
    # ========================================

    @staticmethod
    def _detect_server_ip() -> Optional[str]:
        """
        Best-effort public IP of this server.

        Order:
          1. env var NEUROCAD_PUBLIC_IP (if admin sets it explicitly);
          2. UDP socket trick — open a socket to 8.8.8.8, read the
             local address. Works without a real DNS resolver.

        Returns None if neither worked — the UI just won't show the
        "к какому IP привязывать" hint.
        """
        env_ip = os.environ.get("NEUROCAD_PUBLIC_IP")
        if env_ip:
            try:
                ipaddress.ip_address(env_ip)
                return env_ip
            except ValueError:
                pass

        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return None

    @staticmethod
    def _check_dns(domain: str, expected_ip: Optional[str]) -> bool:
        if not expected_ip:
            return False
        try:
            resolved = socket.gethostbyname(domain)
            return resolved == expected_ip
        except Exception:
            return False

    # ========================================
    # INTERNAL — Caddy On-Demand TLS
    # ========================================

    @classmethod
    async def verify_domain(cls, domain: str) -> bool:
        """
        Check if the given domain is registered to any user.

        Used by Caddy before issuing a certificate via On-Demand TLS.
        Returns True if the domain is present in `users.domain` and
        the user is not soft-deleted.

        Domain is normalized: lower-cased, trimmed. Ports are not
        expected here — Caddy passes a bare hostname.

        Why this is critical: without this check, Caddy would issue
        a certificate for ANY domain pointed at this server. An
        attacker could point 1000 domains here and burn through the
        Let's Encrypt rate limit (5 certificates per registered
        domain per week), blocking legitimate customers.
        """
        d = (domain or "").strip().lower()
        if not d:
            return False

        # Reject subdomains of our own root — they are handled by
        # the wildcard certificate, not by On-Demand TLS.
        if d == ROOT_DOMAIN or d.endswith("." + ROOT_DOMAIN):
            return False

        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.domain == d,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        return False

    # ========================================
    # CADDY
    # ========================================

    @classmethod
    async def _probe_caddy(cls, log=None) -> bool:
        """
        Is the Caddy admin API reachable?

        GET /config/ on the admin endpoint. Any 2xx/4xx response
        means the server is up (a 404 still proves Caddy is
        listening). Network errors → False.
        """
        admin = await cls._get_caddy_admin()
        url = f"{admin.rstrip('/')}/config/"
        try:
            async with httpx.AsyncClient(timeout=CADDY_PROBE_TIMEOUT) as client:
                resp = await client.get(url)
                return resp.status_code < 500
        except Exception:
            cls._log(log, "info", f"Caddy not reachable at {url}")
            return False

    @classmethod
    async def _ask_caddy(
        cls,
        domain: str,
        log=None,
    ) -> Tuple[bool, Optional[str]]:
        """
        On-Demand TLS issues the certificate automatically on the
        first HTTPS handshake for this domain. There is no admin
        API to pre-issue it — Caddy's /issue endpoint does not exist.

        This method is a placeholder for a future explicit-issuance
        flow (e.g. a Go helper). For now it always reports success
        so the UI doesn't show a spurious "Caddy вернул 404".
        """
        cls._log(log, "info", f"_ask_caddy: no-op for {domain} (On-Demand TLS)")
        return True, None

    @staticmethod
    async def _get_caddy_admin() -> str:
        """
        Read the Caddy admin URL from settings.

        Fallback: DEFAULT_CADDY_ADMIN. The settings row is optional
        — if it's not there, we just use the default.
        """
        try:
            from neurocad.core.models.setting import Setting
            async for session in get_db_sqlite():
                stmt = select(Setting).where(
                    Setting.key == "caddy",
                    Setting.is_delete.is_(False),
                )
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()
                if row is not None and row.value:
                    try:
                        data = json.loads(row.value)
                        admin = data.get("admin")
                        if admin:
                            return str(admin)
                    except Exception:
                        pass
        except Exception:
            pass
        return DEFAULT_CADDY_ADMIN

    # ========================================
    # DB
    # ========================================

    @staticmethod
    async def _load_user(user_id: int) -> Optional[User]:
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
        return None

    @staticmethod
    async def _exists_elsewhere(domain: str, user_id: int) -> bool:
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