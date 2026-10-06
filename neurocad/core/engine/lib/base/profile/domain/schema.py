# neurocad/core/engine/lib/base/profile/domain/schema.py

"""
Domain schemas.

Since `users.domain` holds ONE optional custom domain per user,
there is no list of custom domains — just one slot.

Responses carry:

  - subdomain       — read-only free third-level host (<login>.<APP_DOMAIN>);
  - custom          — the user's custom domain, or None;
  - caddy_available — probe result, drives the "Caddy server not found" hint;
  - server_ip       — public IP, shown in DNS instructions;
  - pages           — list of the user's pages (id + title + datetime),
                      used by the "Home page" selector;
  - home_page_id    — the user's chosen home page id (or None);
  - robots_2        — current text of the custom domain's robots.txt;
  - robots_3        — current text of the free subdomain's robots.txt;
  - pages_url       — absolute URL of the public catalog on the owner's
                      public host (https://<login>.<APP_DOMAIN>/pages
                      or https://<custom-domain>/pages);
  - policy          — current markdown text of the user's policy;
  - rules           — current markdown text of the user's rules;
  - policy_default  — fallback markdown the public /policy serves
                      when users.policy is NULL or "";
  - rules_default   — fallback markdown the public /rules serves
                      when users.rules is NULL or "".

Status is NOT stored in the DB. It is derived at read time from the
current DNS record and Caddy availability, so a user who fixed their
DNS sees "active" on the next page load without any extra action.

robots.txt is stored per user:

  - users.robots_2 — the custom second-level domain's robots.txt;
  - users.robots_3 — the free third-level subdomain's robots.txt.

Both fields follow the same rules:

  - NULL in the DB is substituted with DEFAULT_ROBOTS_CLOSED when
    the payload is built, so the frontend always gets a non-empty
    textarea to open;
  - the modal edits whichever field the calling button selects
    (data-which="2" for the custom domain, data-which="3" for the
    subdomain), and POST /domain/robots carries `which` to tell the
    backend where to save the text.

Legal texts (policy / rules) are ALSO stored per user:

  - users.policy — markdown text of the user's Policy page;
  - users.rules  — markdown text of the user's Rules page.

Both fields follow the same rules as robots:

  - NULL and "" are distinct: "" means the user cleared the field
    on purpose, NULL means they never touched it;
  - the modal edits whichever field the calling button selects
    (data-which="policy" or data-which="rules"), and POST
    /domain/legal carries `which` to tell the backend where to
    save the text;
  - the public endpoints /policy and /rules (see public.py) read
    these fields by Host and render them to HTML on the fly;
  - if the field is NULL, "", or whitespace-only, the public
    endpoints serve a universal fallback from
    modal/legal/policy.md / modal/legal/rules.md. The SAME text is
    sent to the frontend in `policy_default` / `rules_default`, so
    the legal modal can seed its textarea with it and show an
    explanatory hint.
  - the public endpoint returns 404 only when the Host does not
    resolve to any user.

sitemap.xml is NOT part of this JSON payload and has NO schema here.
It is generated on the fly (nothing is stored), and returned as
text/plain by GET /domain/sitemap for the in-admin modal viewer, and
as application/xml by the public /sitemap.xml route. Since both
responses are raw XML, a Pydantic model would be wrong: it would
serialize to JSON, not to an XML string. See:
  - service/sitemap.py  → SitemapMixin.build_sitemap()
  - route.py            → GET /sitemap (admin-side, text/plain)
  - utils/routes.py     → public /sitemap.xml (XML)

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field


# Computed status values for the custom domain slot.
DOMAIN_STATUS_NONE      = "none"       # user has no custom domain
DOMAIN_STATUS_ACTIVE    = "active"     # DNS ok + Caddy ok
DOMAIN_STATUS_DNS_FAIL  = "dns_fail"   # DNS points elsewhere
DOMAIN_STATUS_CADDY_OFF = "caddy_off"  # DNS ok, but Caddy is not up


#: Default robots.txt body when the field is empty. Must match the
#: constants in service/robots.py and utils/routes.py.
DEFAULT_ROBOTS_CLOSED = "User-agent: *\nDisallow: /\n"


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
    One page entry for the "Home page" selector.

    Only the fields the selector needs — id, title, datetime (ISO),
    and the computed public URL. The URL is built server-side so the
    frontend does not have to know how /page/<date>/<time> is
    assembled.
    """

    id: int
    title: str
    datetime: Optional[str] = Field(
        None,
        description="Page publication datetime as ISO string",
    )
    url: str = Field(
        ...,
        description="Public URL: /page/<YYYYMMDD>/<HHMMSS>",
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

    #: Text of the custom domain's robots.txt (users.robots_2).
    #: NULL in the DB is substituted with DEFAULT_ROBOTS_CLOSED, so
    #: the frontend can open the modal with a non-empty textarea.
    robots_2: str = Field(
        DEFAULT_ROBOTS_CLOSED,
        description="users.robots_2 — custom-domain robots.txt body",
    )

    #: Text of the free subdomain's robots.txt (users.robots_3).
    #: Same NULL → DEFAULT_ROBOTS_CLOSED substitution as robots_2.
    robots_3: str = Field(
        DEFAULT_ROBOTS_CLOSED,
        description="users.robots_3 — subdomain robots.txt body",
    )

    #: Absolute URL of the public article catalog on the OWNER's
    #: public host:
    #:     https://<login>.<APP_DOMAIN>/pages
    #:     https://<custom-domain>/pages
    #:
    #: Built from get_public_base_url() — the same base the sitemap
    #: and the word toolbar use. Consumed by pages.js →
    #: _loadPublicPagesUrl() for the "Open article catalog" toolbar
    #: button.
    #:
    #: None when the user's public host cannot be resolved — the
    #: frontend then falls back to a relative "/pages", which resolves
    #: against whatever host the admin panel is on (usually not what
    #: we want).
    pages_url: Optional[str] = None

    #: Current markdown text of the user's Policy page (users.policy).
    #: NULL or "" → the frontend opens the modal with `policy_default`
    #: instead, and the public /policy endpoint serves the same
    #: fallback.
    policy: Optional[str] = Field(
        None,
        description="users.policy — markdown body of the Policy page",
    )

    #: Current markdown text of the user's Rules page (users.rules).
    #: Same NULL / "" semantics as `policy`.
    rules: Optional[str] = Field(
        None,
        description="users.rules — markdown body of the Rules page",
    )

    #: Fallback markdown for the Policy page — the same text the
    #: public /policy endpoint serves when users.policy is NULL or
    #: whitespace-only. Read from modal/legal/policy.md on every
    #: request; {date} is substituted with today's ISO date.
    #:
    #: The frontend uses this to seed the legal modal's textarea
    #: when the user has no text yet, and to show a hint that this
    #: is the fallback currently published on the site.
    policy_default: str = Field(
        "",
        description="Fallback markdown for the policy page",
    )

    #: Fallback markdown for the Rules page — same semantics as
    #: `policy_default`, read from modal/legal/rules.md.
    rules_default: str = Field(
        "",
        description="Fallback markdown for the rules page",
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


# ============================================
# ROBOTS.TXT — SET
# ============================================

class CoreEngineLibBaseProfileDomainSetRobotsRequest(BaseModel):
    """
    POST /domain/robots body.

    `which` selects the target field:

      - "2" → users.robots_2 (custom second-level domain);
      - "3" → users.robots_3 (free third-level subdomain).

    `robots` — full text of the file. Stored verbatim, including an
    empty string. The backend does not parse or validate robots.txt
    syntax — that is the frontend's job (presets, hints).

    The modal passes `which` based on which "Edit robots.txt" button
    was clicked (data-which="2" or data-which="3").
    """

    which: Literal["2", "3"] = Field(
        ...,
        description="Which robots.txt to save: '2' for the custom "
                    "domain, '3' for the free subdomain",
    )
    robots: str = Field(
        ...,
        max_length=8192,
        description="Full robots.txt body to store",
    )


class CoreEngineLibBaseProfileDomainSetRobotsData(BaseModel):
    """Result of POST /domain/robots."""

    #: Echoed back so the frontend can update its state without a
    #: second GET. `which` mirrors the request, `robots` is the
    #: saved text (== request text, since we store verbatim).
    which: Literal["2", "3"]
    robots: str


class CoreEngineLibBaseProfileDomainSetRobotsResponse(BaseModel):
    success: bool = True
    data: CoreEngineLibBaseProfileDomainSetRobotsData


# ============================================
# LEGAL — POLICY / RULES
# ============================================

#: Maximum size of a policy / rules markdown body, in characters.
#: Bump this if a user's text ever exceeds it; 64 KB is roughly
#: 20-30 pages of plain markdown, which is far more than any
#: realistic policy or rules text needs.
LEGAL_TEXT_MAX_LENGTH = 65536


class CoreEngineLibBaseProfileDomainSetLegalRequest(BaseModel):
    """
    POST /domain/legal body.

    `which` selects the target field:

      - "policy" → users.policy;
      - "rules"  → users.rules.

    `text` — full markdown body of the document. Stored verbatim,
    including an empty string. The backend does not parse or validate
    markdown — that is the frontend's job when rendering, and the
    public endpoints' job (markdown → HTML on the fly).

    The modal passes `which` based on which "Edit policy" / "Edit
    rules" button was clicked (data-which="policy" or
    data-which="rules").
    """

    which: Literal["policy", "rules"] = Field(
        ...,
        description="Which text to save: 'policy' or 'rules'",
    )
    text: str = Field(
        ...,
        max_length=LEGAL_TEXT_MAX_LENGTH,
        description="Full markdown body to store",
    )


class CoreEngineLibBaseProfileDomainSetLegalData(BaseModel):
    """Result of POST /domain/legal."""

    #: Echoed back so the frontend can update its state without a
    #: second GET. `which` mirrors the request, `text` is the saved
    #: text (== request text, since we store verbatim).
    which: Literal["policy", "rules"]
    text: str


class CoreEngineLibBaseProfileDomainSetLegalResponse(BaseModel):
    success: bool = True
    data: CoreEngineLibBaseProfileDomainSetLegalData


# ============================================
# SITEMAP.XML — NO SCHEMA
# ============================================
#
# There is intentionally NO Pydantic model for sitemap.xml.
#
# Why: both endpoints that serve it return a raw XML string, not
# JSON:
#
#   GET /core/engine/lib/base/profile/domain/sitemap
#       → text/plain       (admin-side, for the SitemapModal viewer)
#
#   GET /sitemap.xml  (on the user's public host)
#       → application/xml  (for search-engine crawlers)
#
# A Pydantic model would be serialized to JSON by FastAPI — that is
# the wrong content type for both endpoints. The XML is built as a
# plain string by SitemapMixin.build_sitemap() and returned with an
# explicit Response(media_type=...) so FastAPI does not touch it.
#
# If a schema is ever needed for documentation purposes, define it
# in the router with response_class=Response and an explicit
# responses={200: {"content": {"application/xml": {}}}} entry —
# do NOT route it through a BaseModel.