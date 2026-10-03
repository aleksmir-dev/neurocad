# neurocad/core/engine/lib/base/profile/domain/schema.py

"""
Domain schemas.

Since `users.domain` holds ONE optional custom domain per user,
there is no list of custom domains — just one slot.

Responses carry:

  - subdomain       — read-only free third-level host (<login>.<APP_DOMAIN>);
  - custom          — the user's custom domain, or None;
  - caddy_available — probe result, drives the "Сервер Caddy не найден" hint;
  - server_ip       — public IP, shown in DNS instructions;
  - pages           — list of the user's pages (id + title + datetime),
                      used by the "Главная страница" selector;
  - home_page_id    — the user's chosen home page id (or None).

Status is NOT stored in the DB. It is derived at read time from the
current DNS record and Caddy availability, so a user who fixed their
DNS sees "active" on the next page load without any extra action.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import Optional, List
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


class CoreEngineLibBaseProfileDomainPageItem(BaseModel):
    """
    One page entry for the "Главная страница" selector.

    Only the fields the selector needs — id, title, datetime (ISO),
    and the computed public URL. The URL is built server-side so the
    frontend does not have to know how /page/<nav_id>/<date>/<time>
    is assembled.
    """

    id: int
    title: str
    datetime: Optional[str] = Field(
        None,
        description="Page publication datetime as ISO string",
    )
    url: str = Field(
        ...,
        description="Public URL: /page/<nav_id>/<YYYYMMDD>/<HHMMSS>",
    )


class CoreEngineLibBaseProfileDomainData(BaseModel):
    """Payload for GET /domain/."""

    subdomain: CoreEngineLibBaseProfileDomainSubdomain
    custom: CoreEngineLibBaseProfileDomainCustom

    #: Caddy probe result — False shows the warning in the UI.
    caddy_available: bool = False

    #: Public IP of this server, for DNS instructions.
    server_ip: Optional[str] = None

    #: Pages that can be chosen as the home page. In datetime ASC
    #: order, same as the fallback logic in utils/routes.py.
    pages: List[CoreEngineLibBaseProfileDomainPageItem] = Field(
        default_factory=list,
        description="User's pages for the home-page selector",
    )

    #: Currently selected home page id (None → not set).
    home_page_id: Optional[int] = Field(
        None,
        description="users.home_page_id — chosen home page, or None",
    )


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


# ============================================
# HOME PAGE — SELECT / CLEAR
# ============================================

class CoreEngineLibBaseProfileDomainHomeSetRequest(BaseModel):
    """
    POST /domain/home body.

    page_id — the page to set as home. The service verifies that the
    page belongs to one of the current user's navs and is not deleted.
    """

    page_id: int = Field(..., gt=0)


class CoreEngineLibBaseProfileDomainHomeData(BaseModel):
    """Result of POST /domain/home and DELETE /domain/home."""

    #: New home page id (None after DELETE).
    home_page_id: Optional[int] = None


class CoreEngineLibBaseProfileDomainHomeResponse(BaseModel):
    success: bool = True
    data: CoreEngineLibBaseProfileDomainHomeData