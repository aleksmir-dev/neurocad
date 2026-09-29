# neurocad/core/engine/lib/base/profile/balance/route.py

"""
Balance routes.

Endpoints (mounted under /core/engine/lib/base/profile/balance):
    GET  /me   — current user's balance

Also mounts the tariff child router:
    GET  /tarif/list    — available tariffs + current state + SBP URL
    POST /tarif/change  — switch the current user's tariff

Full URLs (with parent prefixes /core/engine/lib):
    GET  /core/engine/lib/base/profile/balance/me
    GET  /core/engine/lib/base/profile/balance/tarif/list
    POST /core/engine/lib/base/profile/balance/tarif/change

All endpoints require an authenticated user (any user, not just
superadmin) — a user reads their own balance and changes their
own tariff.

Namespace: CoreEngineLibBaseProfileBalance*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibBaseProfileBalanceService
from .tarif.route import router as tarif_router


router = APIRouter(prefix="/balance", tags=["core/engine/lib/base/profile/balance"])


def _require_user(current_user: dict) -> int:
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return int(user_id)


@router.get("/me")
async def get_my_balance(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Read the current user's balance row (or a zeroed default)."""
    user_id = _require_user(current_user)

    data = await CoreEngineLibBaseProfileBalanceService.get_for_user(
        user_id=user_id,
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        # mode="json" — страховка: datetime → ISO-строка.
        "data": data.model_dump(mode="json"),
    })


# ============================================
# CHILD ROUTERS
# ============================================

router.include_router(tarif_router)