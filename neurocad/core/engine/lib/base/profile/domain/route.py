# neurocad/core/engine/lib/base/profile/domain/route.py

"""
Domain routes.

Endpoints (mounted under /core/engine/lib/base/profile/domain):
    GET    /                  — subdomain + custom slot + Caddy status
                                + pages + home_page_id
    POST   /add               — set custom domain (checks DNS + Caddy)
    DELETE /remove            — clear the custom domain slot
    POST   /home              — set the home page (users.home_page_id)
    DELETE /home              — clear the home page

Full URLs:
    GET    /core/engine/lib/base/profile/domain/
    POST   /core/engine/lib/base/profile/domain/add
    DELETE /core/engine/lib/base/profile/domain/remove
    POST   /core/engine/lib/base/profile/domain/home
    DELETE /core/engine/lib/base/profile/domain/home

All endpoints require an authenticated user.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibBaseProfileDomainAddRequest,
    CoreEngineLibBaseProfileDomainHomeSetRequest,
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
    + the user's pages (for the home-page selector) + home_page_id.
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