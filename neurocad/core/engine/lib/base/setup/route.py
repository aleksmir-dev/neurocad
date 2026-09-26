# neurocad/core/engine/lib/base/setup/route.py

"""
Setup routes.

Endpoints:
    GET  /core/engine/lib/base/setup/llm       — read LLM settings
    PUT  /core/engine/lib/base/setup/llm       — save LLM settings
    POST /core/engine/lib/base/setup/llm/test  — test one provider

All endpoints require superadmin.

Included by base/route.py with prefix "/setup".
Full URLs (with parent prefixes /core/engine/lib/base):
    GET  /core/engine/lib/base/setup/llm
    PUT  /core/engine/lib/base/setup/llm
    POST /core/engine/lib/base/setup/llm/test

Namespace: CoreEngineLibBaseSetup*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibBaseSetupLlmSettings,
    CoreEngineLibBaseSetupLlmUpdateRequest,
    CoreEngineLibBaseSetupLlmTestRequest,
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

    settings_obj = await CoreEngineLibBaseSetupLlmService.get(
        log=request.app.state.log,
    )

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

    saved = await CoreEngineLibBaseSetupLlmService.save(
        payload,
        log=request.app.state.log,
    )

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


# ============================================
# LLM — TEST
# ============================================

@router.post("/llm/test")
async def test_llm_provider(
    data: CoreEngineLibBaseSetupLlmTestRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Test one LLM provider with the current form values.

    The client sends the *current* form values for one provider —
    not the saved ones. This lets the user check a new API key
    before committing it.

    Body:
      {
        "provider": "gemini",
        "config":   { "api_key": "...", "model": "...", ... }
      }

    Response:
      {
        "success": true,
        "message": "OK",
        "detail":  "pong" | "<error body>"
      }

    Available only to superadmin.
    """
    _require_superadmin(current_user)

    result = await CoreEngineLibBaseSetupLlmService.test_provider(
        provider_name=data.provider,
        config=data.config,
        log=request.app.state.log,
    )

    return JSONResponse(result)