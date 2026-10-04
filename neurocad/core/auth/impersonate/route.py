# app/core/auth/impersonate/route.py

"""
Admin impersonation endpoints.

Allows a superadmin to "log in as another user" without knowing
their password, and to return to their own session afterwards.

How it works
------------
Impersonation is a session property, not a user property. When an
admin requests impersonation, the server issues a normal JWT but
with two fields in the payload:

    sub     — the target user's id (whose session we are acting as)
    imp_by  — the admin's id (who is acting as that user)

The JWT is delivered through the same HttpOnly `access_token`
cookie the regular login endpoint uses. `get_current_user` (see
core/auth/dependencies.py) reads `imp_by` from the token and
attaches it to the returned user dict as `impersonated_by`.

Nothing is written to the database. Revoking impersonation is a
matter of overwriting the cookie with a non-impersonated token.

Two endpoints:

    POST /core/auth/impersonate/stop        — stop (anyone with imp_by)
    POST /core/auth/impersonate/{user_id}   — start (superadmin only)

Route order matters
-------------------
`/stop` is a literal path and `/{user_id}` is a dynamic path at the
same level. FastAPI matches routes in the order they are added, so
a dynamic route declared BEFORE a literal one swallows the literal
as a value: POST /impersonate/stop would be routed to `impersonate`
with user_id="stop", which fails Pydantic validation and returns
422. `impersonate_stop` must therefore be declared first.

Both endpoints return a plain success payload; the frontend reloads
the page afterwards so every component re-reads the new session.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from ..dependencies import CoreAuthDependencies
from ..service import CoreAuthService
from ....config import settings


router = APIRouter(prefix="/impersonate", tags=["core/auth/impersonate"])


# ============================================
# HELPERS
# ============================================

def _set_session_cookie(
    response: JSONResponse,
    token: str,
) -> None:
    """
    Attach the access token to the response as the same HttpOnly
    cookie the regular login endpoint uses.

    Kept in one place so that login, impersonate and stop always
    produce identical cookie attributes. If any of these change
    (e.g. secure=True for production), they change here once.
    """
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,   # TODO: set to True once served over HTTPS only
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ============================================
# STOP IMPERSONATION
# ============================================
#
# IMPORTANT — order matters.
# FastAPI matches routes in the order they are added. A literal
# "/stop" must be declared BEFORE the dynamic "/{user_id}", or the
# dynamic route would swallow "stop" as a user_id value and fail
# validation with 422. Do not reorder these two decorators.

@router.post("/stop")
async def impersonate_stop(
    request: Request,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user),
) -> JSONResponse:
    """
    Stop acting as another user and return to the admin session.

    Any user with `impersonated_by` set in the current token may
    call this. The impersonated session is replaced by a normal
    session for the original admin (no `imp_by` field). The
    frontend reloads the page afterwards.
    """
    log = request.app.state.log if hasattr(request.app.state, "log") else None

    admin_id = current_user.get("impersonated_by")
    if not admin_id:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": "Не в режиме импосонации",
            },
        )

    # ---- Issue a normal token for the admin ----
    token = CoreAuthDependencies.create_access_token({
        "sub": str(int(admin_id)),
    })

    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Impersonation stopped",
            "data": {
                "admin_id": int(admin_id),
            },
        },
    )
    _set_session_cookie(response, token)

    if log:
        await log.log_info(
            target="auth",
            message=f"Admin {admin_id} stopped impersonation",
        )

    return response


# ============================================
# START IMPERSONATION
# ============================================
#
# Declared AFTER /stop on purpose — see the note above.

@router.post("/{user_id}")
async def impersonate(
    user_id: int,
    request: Request,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user),
) -> JSONResponse:
    """
    Start acting as another user.

    Only superadmins may call this. The target user must exist and
    not be soft-deleted. The current session is replaced by a
    session for the target user, marked with `imp_by = admin_id`
    so downstream code can tell it apart from a normal session.

    Response body is informational; the actual switch happens
    through the Set-Cookie header. The frontend is expected to
    reload the page after a successful call.
    """
    log = request.app.state.log if hasattr(request.app.state, "log") else None

    # ---- 1. Caller must be a superadmin ----
    if not current_user.get("is_superadmin"):
        if log:
            await log.log_warning(
                target="auth",
                message=(
                    f"User {current_user.get('id')} tried to impersonate "
                    f"user {user_id} without superadmin rights"
                ),
            )
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "message": "Недостаточно прав",
            },
        )

    admin_id = current_user.get("id")
    if not admin_id:
        # Should never happen — get_current_user always returns id.
        raise HTTPException(
            status_code=401,
            detail={"success": False, "message": "Недействительный токен"},
        )

    # ---- 2. Target user must exist and be alive ----
    target = await CoreAuthService.get_user_by_id(user_id, log=log)
    if target is None:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "message": "Пользователь не найден"},
        )

    # ---- 3. Issue an impersonated token ----
    token = CoreAuthDependencies.create_access_token({
        "sub": str(user_id),
        "imp_by": int(admin_id),
    })

    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Impersonation started",
            "data": {
                "admin_id": int(admin_id),
                "target": {
                    "id": target["id"],
                    "login": target["login"],
                    "name": target["name"],
                },
            },
        },
    )
    _set_session_cookie(response, token)

    if log:
        await log.log_info(
            target="auth",
            message=(
                f"Admin {admin_id} impersonated user {user_id} "
                f"({target['login']})"
            ),
        )

    return response