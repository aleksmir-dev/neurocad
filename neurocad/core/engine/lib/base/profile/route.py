# neurocad/core/engine/lib/base/profile/route.py

"""
Profile routes.

Endpoints:
    GET  /core/engine/lib/base/profile/       — current user's profile summary

Also mounts child routers:
    /core/engine/lib/base/profile/balance/...
    /core/engine/lib/base/profile/domain/...

All endpoints require an authenticated user (any logged-in user,
not only superadmin).

Included by base/route.py with prefix "/profile".
Full URLs (with parent prefixes /core/engine/lib/base):
    GET  /core/engine/lib/base/profile/
    GET  /core/engine/lib/base/profile/balance/me
    GET  /core/engine/lib/base/profile/domain/
    POST /core/engine/lib/base/profile/domain/add
    DEL  /core/engine/lib/base/profile/domain/remove

Namespace: CoreEngineLibBaseProfile*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .balance.route import router as balance_router
from .domain.route import router as domain_router


router = APIRouter(prefix="/profile", tags=["core/engine/lib/base/profile"])


# ============================================
# AUTH GUARD
# ============================================

def _require_user(current_user: dict) -> dict:
    """
    Return the current user or raise 401.

    Any authenticated user is allowed — no superadmin check here.
    """
    if not current_user or not current_user.get("id"):
        raise HTTPException(status_code=401, detail="Не авторизован")
    return current_user


# ============================================
# PROFILE — GET
# ============================================

@router.get("/")
async def get_profile(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Minimal profile summary for the current user.

    Used by:
      - the profile landing page (refresh values from the server);
      - BaseAuth._restoreSessionAsync() — the "who am I" fallback
        when sessionStorage is empty but a valid access_token
        cookie is present (e.g. after impersonation, or on a fresh
        tab).

    The response includes `impersonated_by` when the current session
    was issued by an admin acting as this user (see
    core/auth/impersonate/route.py). Without this field the frontend
    would not know it is impersonating and would hide the yellow
    "Вы вошли под пользователем X" bar.

    Available to any authenticated user.
    """
    user = _require_user(current_user)

    return JSONResponse({
        "success": True,
        "data": {
            "id": user.get("id"),
            "login": user.get("login"),
            "name": user.get("name"),
            "is_superadmin": bool(user.get("is_superadmin", False)),
            # Impersonation marker, if any. get_current_user puts
            # `impersonated_by` into the returned dict when the JWT
            # carries `imp_by` (see core/auth/dependencies.py). For
            # a normal session this is absent/None — the frontend
            # then renders the header without the yellow bar.
            "impersonated_by": user.get("impersonated_by"),
        },
    })


# ============================================
# CHILD ROUTERS
# ============================================

router.include_router(balance_router)
router.include_router(domain_router)