# neurocad/core/engine/lib/balance/route.py

"""
Balance routes (admin, superadmin-only).

Endpoints:
    GET  /core/engine/lib/balance/list   — all users + their balance

Also mounts child routers:
    edit  → /core/engine/lib/balance/edit/...
    paid  → /core/engine/lib/balance/paid/...
    qr    → /core/engine/lib/balance/qr/...

All endpoints require superadmin.

Included by the global router (wherever lib/* routers are mounted):
    router.include_router(balance_router)

Full URLs (with parent prefixes /core/engine/lib):
    GET    /core/engine/lib/balance/list
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
# CHILD ROUTERS
# ============================================

router.include_router(edit_router)
router.include_router(paid_router)
router.include_router(qr_router)