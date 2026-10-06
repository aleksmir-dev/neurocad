# neurocad/core/engine/lib/base/profile/domain/service/facade.py

"""
CoreEngineLibBaseProfileDomainService — facade.

Composes all mixins from the service/ package into a single class
so existing code can keep using:

    from .service.facade import CoreEngineLibBaseProfileDomainService

or, from outside the package:

    from neurocad.core.engine.lib.base.profile.domain.service.facade import (
        CoreEngineLibBaseProfileDomainService,
    )

The real logic lives in the mixins:

    common.py   — _log, _load_user, get_public_base_url,
                  _build_subdomain
    dns.py      — _detect_server_ip, _check_dns
    caddy.py    — _probe_caddy, _ask_caddy, _tls_probe,
                  verify_domain, _get_caddy_admin
    domain.py   — add_custom, remove_custom, set_home_page,
                  clear_home_page, _save_domain, _exists_elsewhere
    robots.py   — set_robots, ROBOTS_OPEN, ROBOTS_CLOSED
    sitemap.py  — build_sitemap and helpers
    legal.py    — set_legal, get_legal_for_user, get_legal_for_host
    pages.py    — _list_pages_for_user, _page_public_url

This file contains ONLY the composition. Every method comes from
a mixin. Do not add logic here.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from .common import CommonMixin
from .dns import DnsMixin
from .caddy import CaddyMixin
from .domain import DomainMixin
from .robots import RobotsMixin
from .sitemap import SitemapMixin
from .legal import LegalMixin
from .pages import PagesMixin


class CoreEngineLibBaseProfileDomainService(
    CommonMixin,
    DnsMixin,
    CaddyMixin,
    DomainMixin,
    RobotsMixin,
    SitemapMixin,
    LegalMixin,
    PagesMixin,
):
    """
    Facade for the domain service.

    All methods come from the mixins listed in the class bases.
    MRO order matters only for method resolution: if two mixins
    define the same name, the leftmost one wins. There are no
    such collisions today — CommonMixin provides _log, which the
    other mixins call via `cls._log` / `self._log`.
    """
    pass