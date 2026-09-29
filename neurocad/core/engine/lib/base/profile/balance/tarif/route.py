# neurocad/core/engine/lib/base/profile/balance/tarif/route.py

"""
Tariff change routes.

Endpoints (mounted under /core/engine/lib/base/profile/balance/tarif):
    GET  /list    — available tariffs + current state + SBP URL + SBP QR
    POST /change  — switch the current user's tariff

Full URLs (with parent prefixes /core/engine/lib):
    GET  /core/engine/lib/base/profile/balance/tarif/list
    POST /core/engine/lib/base/profile/balance/tarif/change

Both endpoints require an authenticated user (any user, not just
superadmin) — a user changes their own tariff.

Namespace: CoreEngineLibBaseProfileBalanceTarif*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import CoreEngineLibBaseProfileBalanceTarifChangeData
from .service import CoreEngineLibBaseProfileBalanceTarifService


router = APIRouter(
    prefix="/tarif",
    tags=["core/engine/lib/base/profile/balance/tarif"],
)


# ============================================
# AUTH GUARD
# ============================================

def _require_user(current_user: dict) -> int:
    """Return the current user id, or raise 401."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return int(user_id)


# ============================================
# GET /list
# ============================================

@router.get("/list")
async def get_tarif_list(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return available tariffs + the current user's state.

    Includes:
      - tarifs         — list of options (price, limits, description);
      - current_tarif  — the user's current tariff code;
      - sum            — current balance in rubles;
      - sbp_url        — SBP payment URL from env (may be null);
      - sbp_qr         — public URL of the uploaded SBP QR image
                         (media/<nav_id>/qr.png), or null.

    Available to any authenticated user.
    """
    user_id = _require_user(current_user)

    result = await CoreEngineLibBaseProfileBalanceTarifService.get_list(
        user_id=user_id,
        log=request.app.state.log,
    )

    if result is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse(result.model_dump(mode="json"))


# ============================================
# POST /change
# ============================================

@router.post("/change")
async def change_tarif(
    data: CoreEngineLibBaseProfileBalanceTarifChangeData,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Switch the current user's tariff.

    Body: { "tarif": 0 | 1 | 2 }

    Checks:
      - the tariff code is valid;
      - the user's `sum` is >= the new tariff's price.

    On success:
      - `sum -= price`;
      - limits overwritten with the new tariff's presets;
      - tariff + billing day updated;
      - balances (pages, mb, genday, genmon, tokens) NOT touched.

    On insufficient funds — returns 400 with a structured body so
    the client can show the "top up balance" modal:
        {
          "detail":  "insufficient_funds",
          "sbp_url": "..." | null,
          "sbp_qr":  "..." | null
        }

    Available to any authenticated user.
    """
    user_id = _require_user(current_user)

    item, error_code = await CoreEngineLibBaseProfileBalanceTarifService.change_tarif(
        user_id=user_id,
        new_tarif=data.tarif,
        log=request.app.state.log,
    )

    if error_code == "invalid_tarif":
        raise HTTPException(status_code=400, detail="Некорректный тариф")

    if error_code == "not_found":
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if error_code == "insufficient_funds":
        # Include sbp_qr as well — so the modal can show the QR image
        # without an extra round-trip (the client may have opened the
        # tariff list before the QR was uploaded).
        sbp_qr = await CoreEngineLibBaseProfileBalanceTarifService._get_sbp_qr(user_id)

        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "detail": "insufficient_funds",
                "message": "Недостаточно средств для смены тарифа",
                "sbp_url": CoreEngineLibBaseProfileBalanceTarifService._get_sbp_url(),
                "sbp_qr": sbp_qr,
            },
        )

    return JSONResponse({
        "success": True,
        "data": item,
        "message": f"Тариф изменён на {item['tarif_label']}",
    })