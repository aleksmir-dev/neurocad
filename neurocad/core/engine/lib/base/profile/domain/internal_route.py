# neurocad/core/engine/lib/base/profile/domain/internal_route.py

"""
Internal TLS routes for Caddy On-Demand TLS.

This router is NOT part of the public API. It is called by Caddy
itself, from localhost, before issuing a certificate for an unknown
domain (On-Demand TLS).

Endpoint:
    GET /internal/tls/verify?domain=client-site.com

Response:
    200 — domain is registered to a user → Caddy may issue
    404 — domain is unknown → Caddy refuses

Why this is critical:
    Without this check, Caddy would issue a certificate for ANY
    domain pointed at this server. An attacker could point 1000
    domains here and burn through the Let's Encrypt rate limit
    (5 certificates per registered domain per week), blocking
    legitimate customers.

Mounted at `/internal/tls`, so the full URL is
`/internal/tls/verify`. Caddyfile has
`ask http://127.0.0.1:8010/internal/tls/verify`.

No authentication: Caddy calls it from localhost. The endpoint is
not reachable from the internet (FastAPI binds to 127.0.0.1:8010).

Namespace: CoreEngineLibBaseProfileDomain*
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .service import CoreEngineLibBaseProfileDomainService


router = APIRouter(prefix="/internal/tls", tags=["internal/tls"])


@router.get("/verify")
async def verify_domain_for_tls(
    request: Request,
    domain: str,
) -> JSONResponse:
    """
    Check whether a domain is registered to a user.

    Caddy calls this before issuing an On-Demand TLS certificate.
    """
    ok = await CoreEngineLibBaseProfileDomainService.verify_domain(domain)

    if not ok:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "domain": domain},
        )

    return JSONResponse(
        status_code=200,
        content={"ok": True, "domain": domain},
    )