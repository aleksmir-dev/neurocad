# neurocad/core/engine/lib/base/profile/domain/route.py

"""
Domain routes.

Endpoints (mounted under /core/engine/lib/base/profile/domain):
    GET    /                  — subdomain + custom slot + Caddy status
                                + pages + home_page_id
                                + robots_2 + robots_3
    POST   /add               — set custom domain (checks DNS + Caddy)
    DELETE /remove            — clear the custom domain slot
    POST   /home              — set the home page (users.home_page_id)
    DELETE /home              — clear the home page
    POST   /robots            — save users.robots_2 or users.robots_3
                                (which one is chosen by `which`)
    GET    /sitemap           — sitemap.xml for the current user,
                                generated on the fly, returned as
                                text/plain for the in-admin modal

Full URLs:
    GET    /core/engine/lib/base/profile/domain/
    POST   /core/engine/lib/base/profile/domain/add
    DELETE /core/engine/lib/base/profile/domain/remove
    POST   /core/engine/lib/base/profile/domain/home
    DELETE /core/engine/lib/base/profile/domain/home
    POST   /core/engine/lib/base/profile/domain/robots
    GET    /core/engine/lib/base/profile/domain/sitemap

All endpoints require an authenticated user.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibBaseProfileDomainAddRequest,
    CoreEngineLibBaseProfileDomainHomeSetRequest,
    CoreEngineLibBaseProfileDomainSetRobotsRequest,
)
from .service import CoreEngineLibBaseProfileDomainService


router = APIRouter(prefix="/domain", tags=["core/engine/lib/base/profile/domain"])


def _require_user(current_user: dict) -> dict:
    if not current_user or not current_user.get("id"):
        raise HTTPException(status_code=401, detail="Не авторизован")
    return current_user


# ============================================
# READ
# ============================================

@router.get("/")
async def get_domains(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Free subdomain + custom domain slot + Caddy availability
    + the user's pages (for the home-page selector) + home_page_id
    + the current robots_2 and robots_3 texts (for the robots.txt
    modal, which edits whichever field the user opened).
    """
    user = _require_user(current_user)

    data = await CoreEngineLibBaseProfileDomainService.get_for_user(
        user_id=int(user["id"]),
        login=user.get("login") or "",
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        "data": data.model_dump(mode="json"),
    })


# ============================================
# ADD
# ============================================

@router.post("/add")
async def add_domain(
    body: CoreEngineLibBaseProfileDomainAddRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Set a custom domain.

    Errors:
      400 — invalid domain string
      409 — domain already used by another user
    """
    user = _require_user(current_user)

    data, err = await CoreEngineLibBaseProfileDomainService.add_custom(
        user_id=int(user["id"]),
        raw_domain=body.domain,
        log=request.app.state.log,
    )

    if err == "invalid":
        raise HTTPException(status_code=400, detail="Некорректное имя домена")
    if err == "duplicate":
        raise HTTPException(status_code=409, detail="Этот домен уже подключён другим пользователем")

    return JSONResponse({
        "success": True,
        "data": data.model_dump(mode="json"),
    })


# ============================================
# REMOVE
# ============================================

@router.delete("/remove")
async def remove_domain(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Clear the custom domain slot."""
    user = _require_user(current_user)

    ok = await CoreEngineLibBaseProfileDomainService.remove_custom(
        user_id=int(user["id"]),
        log=request.app.state.log,
    )

    return JSONResponse({"success": True, "removed": ok})


# ============================================
# HOME PAGE — SET
# ============================================

@router.post("/home")
async def set_home_page(
    body: CoreEngineLibBaseProfileDomainHomeSetRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Set the user's home page.

    Body:
      { "page_id": 6 }

    The page must belong to one of the current user's non-deleted
    navs; otherwise 400 is returned.

    Response:
      { "success": true, "data": { "home_page_id": 6 } }

    Errors:
      400 — page does not belong to this user (or is deleted)
      404 — user not found
    """
    user = _require_user(current_user)

    page_id, err = await CoreEngineLibBaseProfileDomainService.set_home_page(
        user_id=int(user["id"]),
        page_id=body.page_id,
        log=request.app.state.log,
    )

    if err == "invalid":
        raise HTTPException(
            status_code=400,
            detail="Эта страница не принадлежит вам или удалена",
        )
    if err == "not_found":
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": {"home_page_id": page_id},
    })


# ============================================
# HOME PAGE — CLEAR
# ============================================

@router.delete("/home")
async def clear_home_page(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Clear the user's home page.

    After this call, "/" on the user's subdomain falls back to the
    first page (ORDER BY datetime ASC) — same logic as before the
    home page was ever set.

    Response:
      { "success": true, "data": { "home_page_id": null } }
    """
    user = _require_user(current_user)

    await CoreEngineLibBaseProfileDomainService.clear_home_page(
        user_id=int(user["id"]),
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        "data": {"home_page_id": None},
    })


# ============================================
# ROBOTS.TXT — SAVE
# ============================================

@router.post("/robots")
async def set_robots(
    body: CoreEngineLibBaseProfileDomainSetRobotsRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save a robots.txt body for the current user.

    Body:
      {
        "which": "2",
        "robots": "User-agent: *\\nDisallow: /\\n"
      }

    `which` selects the target field:

      - "2" → users.robots_2 (custom second-level domain);
      - "3" → users.robots_3 (free third-level subdomain).

    The text is stored verbatim — the backend does not parse or
    validate robots.txt syntax. Empty string is stored as-is.

    Response:
      {
        "success": true,
        "data": { "which": "2", "robots": "<saved text>" }
      }

    Errors:
      400 — invalid `which`
      404 — user not found
    """
    user = _require_user(current_user)

    saved = await CoreEngineLibBaseProfileDomainService.set_robots(
        user_id=int(user["id"]),
        which=body.which,
        text=body.robots,
        log=request.app.state.log,
    )

    if saved is None:
        # set_robots returns None either because the user does not
        # exist or because `which` was outside {"2", "3"}. The
        # Pydantic schema already constrains `which`, so the only
        # remaining case is "user not found".
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": {"which": body.which, "robots": saved},
    })


# ============================================
# SITEMAP.XML — VIEW (admin-side, for the modal)
# ============================================

@router.get("/sitemap")
async def get_sitemap(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> PlainTextResponse:
    """
    sitemap.xml for the currently authenticated user, generated on
    the fly from the `pages` table (nothing is stored — see
    CoreEngineLibBaseProfileDomainService.build_sitemap).

    Returns text/plain, NOT application/xml, on purpose:

      - this endpoint serves the in-admin SitemapModal (a <pre>
        viewer), so a plain-text body is what we want;
      - the PUBLIC sitemap — the one search engines crawl — is
        served at https://<user-host>/sitemap.xml with
        Content-Type: application/xml, by a separate route (see
        utils/routes.py). Both endpoints call the same
        build_sitemap() and produce byte-identical XML; only the
        headers differ.

    We deliberately do NOT make this endpoint return application/xml:
    if it did, a browser navigating to it during debugging would
    download the file instead of rendering it inline — awkward when
    the whole point is to eyeball the XML.

    Cache-Control is no-store so that a page created / edited /
    deleted between two modal opens is reflected immediately, and
    no intermediate proxy caches a stale sitemap.

    Errors:
      401 — not authenticated (handled by _require_user)
    """
    user = _require_user(current_user)

    xml = await CoreEngineLibBaseProfileDomainService.build_sitemap(
        user_id=int(user["id"]),
    )

    return PlainTextResponse(
        content=xml,
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-store, must-revalidate",
            # The sitemap itself must not be indexed — it is a
            # crawler input, not a page.
            "X-Robots-Tag": "noindex",
        },
    )