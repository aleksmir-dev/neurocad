# neurocad/core/engine/lib/base/profile/domain/schema.py

"""
Domain schemas.

Since `users.domain` holds ONE optional custom domain per user,
there is no list of custom domains — just one slot.

Responses carry:

  - subdomain       — read-only free third-level host (<login>.neurocad.ru);
  - custom          — the user's custom domain, or None;
  - caddy_available — probe result, drives the "Сервер Caddy не найден" hint;
  - server_ip       — public IP, shown in DNS instructions.

Status is NOT stored in the DB. It is derived at read time from the
current DNS record and Caddy availability, so a user who fixed their
DNS sees "active" on the next page load without any extra action.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import Optional
from pydantic import BaseModel, Field


# Computed status values for the custom domain slot.
DOMAIN_STATUS_NONE      = "none"       # user has no custom domain
DOMAIN_STATUS_ACTIVE    = "active"     # DNS ok + Caddy ok
DOMAIN_STATUS_DNS_FAIL  = "dns_fail"   # DNS points elsewhere
DOMAIN_STATUS_CADDY_OFF = "caddy_off"  # DNS ok, but Caddy is not up


class CoreEngineLibBaseProfileDomainSubdomain(BaseModel):
    """The free third-level subdomain assigned to the user."""

    login: str = Field(..., description="User login")
    subdomain: str = Field(..., description="Full host, e.g. user1.neurocad.ru")
    root_domain: str = Field("neurocad.ru", description="Root domain")


class CoreEngineLibBaseProfileDomainCustom(BaseModel):
    """The user's custom second-level domain slot."""

    domain: Optional[str] = None
    status: str = Field(DOMAIN_STATUS_NONE, description="See DOMAIN_STATUS_*")
    message: Optional[str] = None


class CoreEngineLibBaseProfileDomainData(BaseModel):
    """Payload for GET /domain/."""

    subdomain: CoreEngineLibBaseProfileDomainSubdomain
    custom: CoreEngineLibBaseProfileDomainCustom

    #: Caddy probe result — False shows the warning in the UI.
    caddy_available: bool = False

    #: Public IP of this server, for DNS instructions.
    server_ip: Optional[str] = None


class CoreEngineLibBaseProfileDomainResponse(BaseModel):
    success: bool = True
    data: CoreEngineLibBaseProfileDomainData


class CoreEngineLibBaseProfileDomainAddRequest(BaseModel):
    """POST /domain/add body."""

    domain: str = Field(..., min_length=4, max_length=253)


class CoreEngineLibBaseProfileDomainAddData(BaseModel):
    """Result of POST /domain/add."""

    domain: str

    #: Whether the domain's A-record now points to us.
    dns_ok: bool = False

    #: Whether Caddy accepted the request.
    caddy_available: bool = False

    #: Expected A-record value for the DNS-instruction block.
    server_ip: Optional[str] = None

    #: Human-readable result, shown under the form.
    message: Optional[str] = None


class CoreEngineLibBaseProfileDomainAddResponse(BaseModel):
    success: bool = True
    data: CoreEngineLibBaseProfileDomainAddData


class CoreEngineLibBaseProfileDomainRemoveResponse(BaseModel):
    success: bool = True
    removed: bool = False