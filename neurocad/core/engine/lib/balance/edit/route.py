# neurocad/core/engine/lib/balance/edit/route.py

"""
Balance edit routes (admin, superadmin-only).

Endpoints (mounted under /core/engine/lib/balance/edit):
    GET  /{user_id}   — read current values (for the edit form)
    PUT  /{user_id}   — upsert (create-or-update)

Full URLs (with parent prefixes /core/engine/lib):
    GET  /core/engine/lib/balance/edit/{user_id}
    PUT  /core/engine/lib/balance/edit/{user_id}

All endpoints require superadmin.

Datetime serialization:
    Both responses use model_dump(mode="json"), so datetime fields
    (updated_at) go out as ISO strings — Starlette can serialize them.

Namespace: CoreEngineLibBalanceEdit*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import CoreEngineLibBalanceEditData
from .service import CoreEngineLibBalanceEditService


router = APIRouter(prefix="/edit", tags=["core/engine/lib/balance/edit"])


# ============================================
# AUTH GUARD
# ============================================

def _require_superadmin(current_user: dict) -> None:
    """Raise 403 if the current user is not a superadmin."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# ============================================
# GET
# ============================================

@router.get("/{user_id}")
async def get_balance_for_edit(
    user_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Read one user's balance for the edit form.

    Applies defaults (all zeros) if the user has no Balance row.
    Returns 404 if the user does not exist at all.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    item = await CoreEngineLibBalanceEditService.get_for_edit(
        user_id=user_id,
        log=request.app.state.log,
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": item.model_dump(mode="json"),
    })


# ============================================
# PUT
# ============================================

@router.put("/{user_id}")
async def save_balance(
    user_id: int,
    data: CoreEngineLibBalanceEditData,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Upsert one user's balance.

    Creates the Balance row if it does not exist, updates it
    otherwise. Returns the saved row.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    # Convert to a plain dict; None values are skipped on update
    # inside the root service.
    payload = data.model_dump()

    item = await CoreEngineLibBalanceEditService.save(
        user_id=user_id,
        data=payload,
        log=request.app.state.log,
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": item.model_dump(mode="json"),
    })