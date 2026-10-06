# neurocad/core/engine/lib/base/profile/domain/service/dns.py

"""
DNS helpers for the domain service.

Provides:

  - _detect_server_ip() — best-effort public IP of this server;
  - _check_dns()        — verify that a domain's A-record points
                          to the expected IP.

Both are used by the custom-domain workflow: when a user attaches
a domain, we need to know whether their DNS is configured before
asking Caddy to issue a certificate. If DNS is wrong, we skip
the Caddy call and show the "set up DNS" instructions instead.

Concurrency notes
-----------------
socket.gethostbyname() is a BLOCKING call: it has no timeout
parameter and relies on the OS resolver, which can hang for up to
~30 seconds if the DNS server is unresponsive. Calling it directly
from an async handler would block the event loop and stall every
other request for the duration.

To avoid that, _check_dns():

  1. runs gethostbyname() in a thread pool via run_in_executor(),
     so the event loop stays free;
  2. wraps the executor call in asyncio.wait_for() with
     DNS_RESOLVE_TIMEOUT, so a stuck resolver cannot hold a worker
     thread indefinitely.

The method is therefore `async` — all callers must `await` it.

Namespace: CoreEngineLibBaseProfileDomain*
"""

import asyncio
import ipaddress
import os
import socket
from typing import Optional

from .constants import DNS_RESOLVE_TIMEOUT


class DnsMixin:
    """DNS helpers: server IP detection and A-record check."""

    # ========================================
    # SERVER IP
    # ========================================

    @staticmethod
    def _detect_server_ip() -> Optional[str]:
        """
        Best-effort public IP of this server.

        Order:
          1. env var NEUROCAD_PUBLIC_IP (if admin sets it explicitly);
          2. UDP socket trick — open a socket to 8.8.8.8, read the
             local address. Works without a real DNS resolver.

        This is fast (microseconds) and does not need a thread pool:
        the UDP "connect" does not send any packets, it only lets
        the kernel pick the outgoing interface, and get_sockname()
        returns the local IP immediately.

        Returns None if neither worked — the UI just won't show the
        "which IP to point at" hint.
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

    # ========================================
    # DNS CHECK
    # ========================================

    @staticmethod
    async def _check_dns(domain: str, expected_ip: Optional[str]) -> bool:
        """
        True if `domain` resolves to `expected_ip` via A-record.

        The blocking gethostbyname() call is offloaded to a thread
        pool so the event loop stays responsive while DNS is being
        resolved. A single lookup is capped at DNS_RESOLVE_TIMEOUT
        seconds; if the resolver does not answer within that window
        we treat the domain as "not configured".

        Returns False if:
          - expected_ip is None (nothing to compare against);
          - the domain does not resolve;
          - it resolves to a different IP;
          - the resolver takes longer than DNS_RESOLVE_TIMEOUT.
        """
        if not expected_ip:
            return False

        def _resolve() -> bool:
            try:
                resolved = socket.gethostbyname(domain)
                return resolved == expected_ip
            except Exception:
                return False

        try:
            return await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, _resolve),
                timeout=DNS_RESOLVE_TIMEOUT,
            )
        except asyncio.TimeoutError:
            return False