# neurocad/core/engine/lib/base/profile/domain/service/constants.py

"""
Domain service constants.

Extracted from the old service.py so all mixins in the service/
package can use them without circular imports.

Contains:

  - ROOT_DOMAIN           — application root domain (APP_DOMAIN);
  - PROTECTED_DOMAINS     — apex domains owned by the platform;
  - PROTECTED_SUFFIXES    — suffixes covered by protection;
  - is_protected_domain() — protection check;
  - DOMAIN_GRACE_DAYS     — days to wait before deleting a
                            detached domain's certificate;
  - _DOMAIN_RE            — domain-name validation regex;
  - DEFAULT_CADDY_ADMIN   — default Caddy Admin API address;
  - CADDY_PROBE_TIMEOUT   — probe request timeout to Caddy;
  - TLS_PROBE_FIRST_TIMEOUT — first TLS probe timeout (ACME);
  - TLS_PROBE_RETRY_TIMEOUT — retry TLS probe timeout.
"""

import re

from neurocad.config import settings


# ============================================
# ROOT DOMAIN
# ============================================

#: Application root domain. Read from settings so a single .env
#: line switches the whole thing between environments:
#:
#:   APP_DOMAIN=neurocad-dev.ru   (dev)
#:   APP_DOMAIN=neurocad.ru       (prod)
#:
#: Used to build the free subdomain (<login>.<ROOT_DOMAIN>) and
#: to reject custom domains ending with .<ROOT_DOMAIN> — those
#: are covered by the wildcard certificate, not On-Demand TLS.
#:
#: MUST match a domain that Caddy actually serves with a
#: wildcard certificate (e.g. *.neurocad-dev.ru on dev).
ROOT_DOMAIN = settings.APP_DOMAIN


# ============================================
# PROTECTED DOMAINS
# ============================================

#: Domains owned by the platform. Their certificates must never
#: be deleted. Add future system domains here.
PROTECTED_DOMAINS = frozenset({
    "neurocad.ru",
    "neurocad-dev.ru",
    "neurocad-demo.ru",
})

#: Same, but for whole subtrees: *.neurocad.ru, *.neurocad-dev.ru, ...
PROTECTED_SUFFIXES = (
    ".neurocad.ru",
    ".neurocad-dev.ru",
    ".neurocad-demo.ru",
)


def is_protected_domain(name: str) -> bool:
    """
    True if the domain is owned by the platform itself.

    Normalizes the input: lowercases, strips one trailing dot.
    Empty string / None → False.
    """
    d = (name or "").strip().lower().rstrip(".")
    if d in PROTECTED_DOMAINS:
        return True
    return any(d.endswith(s) for s in PROTECTED_SUFFIXES)


# ============================================
# GRACE PERIOD
# ============================================

#: Days between detaching a custom domain and physically deleting
#: its Caddy certificate. If the user changes their mind within
#: this period, deletion is cancelled.
DOMAIN_GRACE_DAYS = 30


# ============================================
# DOMAIN VALIDATION
# ============================================

#: Domain-name validation regex:
#:   - 4 to 253 characters total;
#:   - label's first character is not a hyphen;
#:   - one or more labels separated by dots;
#:   - TLD is letters only, 2 to 63 characters.
_DOMAIN_RE = re.compile(
    r"^(?=.{4,253}$)"
    r"(?!-)"
    r"(?:[a-z0-9-]{1,63}\.)+"
    r"[a-z]{2,63}$",
    re.IGNORECASE,
)


# ============================================
# CADDY
# ============================================

#: Default Caddy Admin API address. May be overridden via
#: Setting(key="caddy") in the DB (see CaddyMixin._get_caddy_admin).
DEFAULT_CADDY_ADMIN = "http://127.0.0.1:2019"

#: Probe request timeout to Caddy Admin API. Caddy answers
#: instantly; 2 seconds is plenty.
CADDY_PROBE_TIMEOUT = 2.0

#: TLS probe timeouts (see CaddyMixin._ask_caddy).
#:
#: First attempt: Caddy issues the certificate ON this handshake.
#: Let's Encrypt ACME takes 10–25 seconds in practice — 30 is a
#: safe upper bound. If it does not finish in time, the connection
#: is dropped and we retry.
#:
#: Second attempt: the certificate is either already issued (Caddy
#: has cached the ACME response) or Caddy has given up. The
#: handshake is instantaneous; 5 seconds is plenty.
TLS_PROBE_FIRST_TIMEOUT = 30.0
TLS_PROBE_RETRY_TIMEOUT = 5.0

# ============================================
# DNS
# ============================================

#: Timeout for a single DNS A-record lookup (see DnsMixin._check_dns).
#:
#: socket.gethostbyname() has no timeout parameter — it relies on
#: the OS resolver, which can hang for up to ~30 seconds if the
#: DNS server is unresponsive. We wrap the call in
#: asyncio.wait_for() with this timeout so a single stuck lookup
#: cannot hold a worker thread forever.
#:
#: 5 seconds is enough for any working resolver. If the domain's
#: A-record is misconfigured or the DNS server is down, we would
#: rather report "DNS not configured" quickly than make the user
#: wait half a minute.
DNS_RESOLVE_TIMEOUT = 5.0