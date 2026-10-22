# core/engine/lib/llm/agents/_01_logo/route.py

"""
HTTP endpoint for the logo agent.

Mounted at:

    POST /core/engine/lib/llm/agents/_01_logo/generate

This is a NEW endpoint, separate from the legacy one at

    POST /core/engine/lib/word/editor/images/generate

Both call the same logic, but the legacy endpoint also handles the
balance check, the image registry, and the token charge. This new
endpoint does the same steps in its own route, so the old one can
eventually be retired without touching the working code today.

Request body (JSON):
    {
      "prompt": "Нейрокад — CMS нового поколения",
      "alt":    "Нейрокад",
      "source": "logo"
    }

Response (JSON):
    {
      "success": true,
      "data": {
        "id":    "img-a1b2c3d4",
        "file":  "files/img-a1b2c3d4.svg",
        "url":   "/static/core/engine/lib/word/editor/images/files/img-a1b2c3d4.svg",
        "bytes": 1234
      }
    }

On any error — HTTP 4xx/5xx with a plain "detail" string.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.balance import Balance
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.checked import BalanceChecked

from .service import CoreEngineLibLlmAgentsLogoService
from .schema import (
    CoreEngineLibLlmAgentsLogoRequest,
    CoreEngineLibLlmAgentsLogoResponse,
)


router = APIRouter(
    prefix="/_01_logo",
    tags=["core/engine/lib/llm/agents/_01_logo"],
)


# ============================================
# BALANCE CHARGE
# ============================================

async def _charge_logo(user_id: int, provider, log=None) -> None:
    """
    Charge the logo generation to the user's Balance.

    - tokens -= provider.tokens_used (clamped at 0)
    - gen    -= 1 on pro only
    - updated_at = now

    Best-effort: a failure here is logged but does not fail the
    request (the SVG has already been saved).
    """
    usage = int(getattr(provider, "tokens_used", 0) or 0)

    try:
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(stmt)).scalar_one_or_none()
            if bal is None:
                return

            if usage > 0:
                bal.tokens = max(0, (bal.tokens or 0) - usage)

            if bal.tarif == 1:
                bal.gen = max(0, (bal.gen or 0) - 1)

            bal.updated_at = datetime.now()
            await session.commit()

            if log is not None:
                try:
                    log.log_info_sync(
                        target="llm-logo",
                        message=(
                            f"user {user_id} charged {usage} tokens"
                            + (" + 1 gen" if bal.tarif == 1 else "")
                        ),
                    )
                except Exception:
                    pass
            return
    except Exception as e:
        if log is not None:
            try:
                log.log_warning_sync(
                    target="llm-logo",
                    message=f"charge failed for user {user_id}: {e}",
                )
            except Exception:
                pass


# ============================================
# GENERATE
# ============================================

@router.post("/generate", response_model=CoreEngineLibLlmAgentsLogoResponse)
async def generate_logo(
    data: CoreEngineLibLlmAgentsLogoRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Generate an SVG logo via the LLM and save it to the image registry.

    Balance guard
    -------------
    Only users on a paid tariff (Pro / LLM) with tokens left can
    generate. Free users get 403 llm_not_available; exhausted
    tokens / generations get 403 tokens_exhausted / gen_exhausted.

    Saving
    ------
    The SVG is written to the same image registry as the legacy
    /word/editor/images/generate endpoint
    (CoreEngineLibWordImagesService). That keeps both endpoints
    producing identical file layout and registry entries, so the
    UI can switch between them without noticing.

    Charging
    --------
    After the SVG is saved, provider.tokens_used is subtracted
    from the user's Balance (and one generation on Pro).
    Best-effort: a failure here does not fail the request.
    """
    log = getattr(request.app.state, "log", None)

    # ---- 0. Balance guard ----
    user_id = int(current_user.get("id"))
    _bal, err = await BalanceChecked.logo_allowed(user_id, log=log)
    if err:
        detail_map = {
            "llm_not_available": (
                "Генерация недоступна на тарифе Free. "
                "Перейдите на тариф Pro или LLM."
            ),
            "tokens_exhausted": (
                "Закончились токены LLM на этот месяц. "
                "Они восстановятся в расчётный день."
            ),
            "gen_exhausted": (
                "Закончились генерации на этот месяц. "
                "Они восстановятся в расчётный день."
            ),
            "no_balance": (
                "Не удалось определить ваш тариф. "
                "Обратитесь к администратору."
            ),
        }
        raise HTTPException(
            status_code=403,
            detail=detail_map.get(err, "Лимит исчерпан."),
        )

    # ---- 1. LLM provider ----
    try:
        from neurocad.utils.llm.factory import get_provider
        provider = await get_provider(log=log)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get LLM provider: {e}",
        )

    # ---- 2. Run the service ----
    service = CoreEngineLibLlmAgentsLogoService()
    try:
        result = await service.generate(
            provider=provider,
            user_message=data.prompt,
            alt=data.alt or "",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation error: {e}",
        )

    svg = result.get("svg")
    if not svg:
        raise HTTPException(
            status_code=400,
            detail=result.get("error") or "Failed to generate SVG",
        )

    # ---- 3. Save to the image registry ----
    try:
        from neurocad.core.engine.lib.word.editor.images.service import (
            CoreEngineLibWordImagesService,
        )
        saved = CoreEngineLibWordImagesService.create_image(
            svg=svg,
            alt=data.alt or "",
            source=data.source or "logo",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save image: {e}",
        )

    # ---- 4. Charge tokens (+1 gen on pro) ----
    await _charge_logo(user_id=user_id, provider=provider, log=log)

    # ---- 5. Public URL ----
    file_rel = saved["file"]                      # "files/img-xxxx.svg"
    url = f"/static/core/engine/lib/word/editor/images/{file_rel}"

    return JSONResponse({
        "success": True,
        "data": {
            "id": saved["id"],
            "file": saved["file"],
            "url": url,
            "bytes": saved.get("bytes", 0),
        },
    })