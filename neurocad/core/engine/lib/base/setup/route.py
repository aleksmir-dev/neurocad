# neurocad/core/engine/lib/base/setup/route.py

"""
Setup routes.

Endpoints:
    GET  /core/engine/lib/base/setup/llm — read LLM settings
    PUT  /core/engine/lib/base/setup/llm — save LLM settings

Both endpoints require superadmin.

Included by base/route.py with prefix "/setup".
Full URLs (with parent prefixes /core/engine/lib/base):
    GET  /core/engine/lib/base/setup/llm
    PUT  /core/engine/lib/base/setup/llm

Namespace: CoreEngineLibBaseSetup*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibBaseSetupLlmSettings,
    CoreEngineLibBaseSetupLlmUpdateRequest,
)
from .service import CoreEngineLibBaseSetupLlmService


router = APIRouter(prefix="/setup", tags=["core/engine/lib/base/setup"])


# ============================================
# AUTH GUARD
# ============================================

def _require_superadmin(current_user: dict) -> None:
    """Raise 403 if the current user is not a superadmin."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# ============================================
# LLM — GET
# ============================================

@router.get("/llm")
async def get_llm_settings(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Read LLM settings.

    Returns the full settings document with secrets decrypted
    (so the client can show them in form fields), plus a flag
    indicating whether encryption is available.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    settings_obj = await CoreEngineLibBaseSetupLlmService.get()

    return JSONResponse({
        "success": True,
        "data": settings_obj.model_dump(),
        "crypto_available": CoreEngineLibBaseSetupLlmService.is_crypto_available(),
    })


# ============================================
# LLM — PUT
# ============================================

@router.put("/llm")
async def save_llm_settings(
    data: CoreEngineLibBaseSetupLlmUpdateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save LLM settings.

    Full replacement — the client always sends the complete document.
    Secrets are sent in plaintext (the client just fetched them
    decrypted); the server encrypts them before persisting.

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    # Convert request → internal settings object.
    payload = CoreEngineLibBaseSetupLlmSettings(
        active_provider=data.active_provider,
        providers=data.providers,
    )

    saved = await CoreEngineLibBaseSetupLlmService.save(payload)

    crypto_ok = CoreEngineLibBaseSetupLlmService.is_crypto_available()
    message = None
    if not crypto_ok:
        message = (
            "Ключ шифрования не настроен. Секреты сохранены в открытом виде. "
            "Добавьте NEUROCAD_SECRET_KEY в .env для защиты."
        )

    return JSONResponse({
        "success": True,
        "data": saved.model_dump(),
        "crypto_available": crypto_ok,
        "message": message,
    })