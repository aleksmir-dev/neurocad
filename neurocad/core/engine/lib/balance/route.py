# neurocad/core/engine/lib/balance/route.py

"""
Balance routes (admin, superadmin-only).

Endpoints:
    GET  /core/engine/lib/balance/list   — all users + their balance
    POST /core/engine/lib/balance/ensure — idempotent, self-serve

Also mounts child routers:
    edit  → /core/engine/lib/balance/edit/...
    paid  → /core/engine/lib/balance/paid/...
    qr    → /core/engine/lib/balance/qr/...

Access:
    /list and child routers require superadmin.
    /ensure — any authenticated user, but only ever touches their
    own row.

Included by the global router (wherever lib/* routers are mounted):
    router.include_router(balance_router)

Full URLs (with parent prefixes /core/engine/lib):
    GET    /core/engine/lib/balance/list
    POST   /core/engine/lib/balance/ensure
    GET    /core/engine/lib/balance/edit/{user_id}
    PUT    /core/engine/lib/balance/edit/{user_id}
    POST   /core/engine/lib/balance/paid/{user_id}
    GET    /core/engine/lib/balance/qr/status
    POST   /core/engine/lib/balance/qr/upload
    DELETE /core/engine/lib/balance/qr

Namespace: CoreEngineLibBalance*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibBalanceService
from .edit.route import router as edit_router
from .paid.route import router as paid_router
from .qr.route import router as qr_router


router = APIRouter(prefix="/balance", tags=["core/engine/lib/balance"])


# ============================================
# AUTH GUARD
# ============================================

def _require_superadmin(current_user: dict) -> None:
    """Raise 403 if the current user is not a superadmin."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# ============================================
# LIST
# ============================================

@router.get("/list")
async def get_balance_list(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return all users + their balance (or zeroed defaults).

    LEFT JOIN: users without a Balance row are included with
    has_balance=False, so the admin can spot and create them.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    items = await CoreEngineLibBalanceService.get_list(
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        # mode="json" — Pydantic сериализует datetime в ISO-строку,
        # иначе Starlette падает с "Object of type datetime is not
        # JSON serializable". Правило проекта: все datetime-поля
        # уходят на клиент строками.
        "data": [item.model_dump(mode="json") for item in items],
        "total": len(items),
    })


# ============================================
# ENSURE (idempotent, self-serve)
# ============================================

@router.post("/ensure")
async def ensure_balance(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Create a Balance row for the current user if one does not exist.

    Called as a post-registration side effect by BaseAuth
    (see core/engine/lib/base/auth/auth.js, _handleRegistered).
    The registration form itself does not know about balance —
    it only emits `auth:registered`, and BaseAuth reacts.

    Idempotent:
        - if the user already has a balance row → 200, no change;
        - if not → creates it with defaults, 200.

    Any authenticated user — it only ever touches their OWN row.
    No superadmin check: a freshly registered user must be able to
    call it on themselves.
    """
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Lazy import — avoids loading the sqlite helper (and its deps)
    # at module import time, keeps the router light.
    from neurocad.utils.sqlite import ensure_user_balance

    try:
        await ensure_user_balance(int(user_id), log=request.app.state.log)
    except Exception as e:
        # Non-fatal: lazy creation in BalanceChecked / assets will
        # create the row on first real use (media upload / page
        # create / LLM call). The user does not need to see this.
        raise HTTPException(
            status_code=500,
            detail=f"Failed to ensure balance: {e}",
        )

    return JSONResponse({
        "success": True,
        "message": "Balance ensured",
    })


# ============================================
# CHILD ROUTERS
# ============================================

router.include_router(edit_router)
router.include_router(paid_router)
router.include_router(qr_router)