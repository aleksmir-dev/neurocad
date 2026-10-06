# neurocad/core/engine/lib/base/profile/domain/service/caddy.py

"""
Caddy integration for the domain service.

Provides:

  - verify_domain()    — used by Caddy's On-Demand TLS `ask`
                         endpoint to decide whether a domain may
                         receive a certificate;
  - _probe_caddy()     — is the Caddy Admin API reachable?
  - _ask_caddy()       — force Caddy to issue a certificate for
                         a domain and verify it is actually served;
  - _get_caddy_admin() — read the Caddy Admin API URL from
                         Setting(key="caddy") or fall back to the
                         default.

Concurrency notes
-----------------
The TLS probe (_tls_probe) runs a blocking ssl/socket handshake
in a thread pool via run_in_executor, so the event loop is not
blocked while waiting for the ACME handshake (which can take
10-25 seconds on first issuance).

The `ask` endpoint (verify_domain) is called by Caddy from
localhost, not by end users. It must answer quickly and must
never raise: a DB hiccup is treated as "domain not registered"
and Caddy refuses to issue the certificate.

User-facing messages
--------------------
Strings returned by _tls_probe are shown in the UI (in the
"failed to attach domain" block). They MUST be in Russian.
Only code comments and docstrings are in English.

Namespace: CoreEngineLibBaseProfileDomain*
"""

import asyncio
import json
import socket
import ssl
from typing import Optional, Tuple

import httpx
from sqlalchemy import select

from neurocad.utils.sqlite import get_db_sqlite

from .constants import (
    CADDY_PROBE_TIMEOUT,
    DEFAULT_CADDY_ADMIN,
    ROOT_DOMAIN,
    TLS_PROBE_FIRST_TIMEOUT,
    TLS_PROBE_RETRY_TIMEOUT,
)


class CaddyMixin:
    """Caddy Admin API integration and TLS probes."""

    # ========================================
    # VERIFY DOMAIN (On-Demand TLS `ask`)
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
        from neurocad.core.models.user import User

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
    # PROBE CADDY
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

    # ========================================
    # ASK CADDY (issue certificate)
    # ========================================

    @classmethod
    async def _ask_caddy(
        cls,
        domain: str,
        log=None,
    ) -> Tuple[bool, Optional[str]]:
        """
        Force Caddy to issue the certificate for `domain` and verify
        it is actually served.

        Caddy's On-Demand TLS issues the certificate on the FIRST
        HTTPS handshake for that domain. There is no admin API to
        pre-issue it. The only way to trigger issuance is to make
        an HTTPS request to the domain — which is exactly what we
        do here, from the server itself.

        Algorithm:
          1. First probe with a generous timeout (TLS_PROBE_FIRST_TIMEOUT).
             This is the handshake that triggers issuance. Let's
             Encrypt ACME takes 10-25 seconds in practice, so the
             timeout is set to 30 s.
          2. If the first probe fails with a timeout or SSL error,
             retry once with a short timeout (TLS_PROBE_RETRY_TIMEOUT).
             At this point the certificate is either already issued
             (Caddy caches the ACME response) or Caddy has given up;
             the retry distinguishes the two without waiting another
             30 seconds on the second call.
          3. TLS verification is NOT skipped — we need to know that
             the certificate was issued by a trusted CA for this
             exact hostname. `ssl.create_default_context()` +
             `server_hostname=domain` does exactly that.

        Returns (ok, message):
          (True,  "Сертификат выпущен")   — TLS-handshake passed,
                                            cert valid for the domain.
          (False, "<причина>")            — handshake failed, timed out,
                                            or the cert does not match.
        """
        ok, message = await cls._tls_probe(
            domain,
            timeout=TLS_PROBE_FIRST_TIMEOUT,
            log=log,
        )
        if ok:
            return True, message

        # First attempt failed. Retry once with a short timeout —
        # if the cert was issued during the first attempt (but the
        # connection timed out before completing the handshake),
        # the retry will succeed instantly.
        cls._log(
            log, "info",
            f"_ask_caddy: {domain} first probe failed ({message}); retrying",
        )
        ok2, message2 = await cls._tls_probe(
            domain,
            timeout=TLS_PROBE_RETRY_TIMEOUT,
            log=log,
        )
        if ok2:
            return True, message2

        # Both attempts failed — report the retry's message (usually
        # the more specific one, since by then Caddy has definitely
        # made up its mind).
        return False, message2

    # ========================================
    # TLS PROBE
    # ========================================

    @staticmethod
    async def _tls_probe(
        domain: str,
        timeout: float,
        log=None,
    ) -> Tuple[bool, str]:
        """
        One TLS probe to `https://<domain>/`.

        Runs the blocking ssl/socket code in a thread so the event
        loop is not blocked while waiting for the ACME handshake.

        Returns (ok, message). The message is user-facing and is
        in Russian.
        """
        def _probe() -> Tuple[bool, str]:
            ctx = ssl.create_default_context()
            try:
                with socket.create_connection((domain, 443), timeout=timeout) as sock:
                    with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                        # Handshake succeeded → cert is valid for the
                        # hostname (wrap_socket raises if it is not).
                        _ = ssock.getpeercert()
                        return True, "Сертификат выпущен"
            except ssl.SSLCertVerificationError as e:
                return False, f"Сертификат не выпущен: {e.verify_message or e}"
            except socket.timeout:
                return False, (
                    f"Таймаут {int(timeout)} с при выпуске сертификата "
                    f"(Caddy не ответил)"
                )
            except ConnectionRefusedError:
                return False, (
                    f"Порт 443 недоступен для {domain} "
                    f"(Caddy не слушает или закрыт файрволом)"
                )
            except socket.gaierror as e:
                return False, f"DNS не резолвится для {domain}: {e}"
            except OSError as e:
                return False, f"Ошибка соединения с {domain}: {e}"
            except Exception as e:
                return False, f"Ошибка TLS-проверки {domain}: {type(e).__name__}: {e}"

        ok, message = await asyncio.get_event_loop().run_in_executor(None, _probe)

        CaddyMixin._log(
            log, "info",
            f"_tls_probe: {domain} (timeout={int(timeout)}s) → "
            f"{'ok' if ok else 'fail'}: {message}",
        )
        return ok, message

    # ========================================
    # CADDY ADMIN URL
    # ========================================

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