# neurocad/core/engine/lib/balance/paid/route.py

"""
Balance paid routes (admin, superadmin-only).

Endpoint (mounted under /core/engine/lib/balance/paid):
    POST /{user_id}   — sum += amount

Full URL (with parent prefixes /core/engine/lib):
    POST /core/engine/lib/balance/paid/{user_id}

Request body:
    { "amount": 500 }

Response:
    { "success": true, "data": {...}, "message": "Оплата зачислена: +500" }

Requires superadmin.

Namespace: CoreEngineLibBalancePaid*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import CoreEngineLibBalancePaidData
from .service import CoreEngineLibBalancePaidService


router = APIRouter(prefix="/paid", tags=["core/engine/lib/balance/paid"])


# ============================================
# AUTH GUARD
# ============================================

def _require_superadmin(current_user: dict) -> None:
    """Raise 403 if the current user is not a superadmin."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# ============================================
# POST — PAID
# ============================================

@router.post("/{user_id}")
async def paid_balance(
    user_id: int,
    data: CoreEngineLibBalancePaidData,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Add `amount` to the user's `sum`.

    Creates the Balance row if it does not exist.
    Returns the updated row + a human-readable message.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    item = await CoreEngineLibBalancePaidService.paid(
        user_id=user_id,
        amount=data.amount,
        log=request.app.state.log,
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": item.model_dump(),
        "message": f"Оплата зачислена: +{data.amount}",
    })