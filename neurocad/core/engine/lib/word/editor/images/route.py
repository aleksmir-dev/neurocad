# neurocad/core/engine/lib/word/editor/images/route.py

"""
Images editor API: list, create, read, delete, generate.

Namespace: CoreEngineLibWordImagesRoute

Mounted under the parent editor router (prefix="/editor"), so the
final paths are:
  GET    /core/engine/lib/word/editor/images             — list
  POST   /core/engine/lib/word/editor/images             — create
  POST   /core/engine/lib/word/editor/images/generate    — generate via LLM
  GET    /core/engine/lib/word/editor/images/<id>        — read metadata
  DELETE /core/engine/lib/word/editor/images/<id>        — delete

Permissions:
  All endpoints require an authenticated user (get_current_user).
  Guests get 401 from the dependency.

  /generate additionally enforces the user's tariff:
    - free        → 403 llm_not_available
    - tokens <= 0 → 403 tokens_exhausted
    - pro gen <= 0 → 403 gen_exhausted
  On success, tokens (and, on pro, one gen) are charged to Balance.

The list is served from the registry (registry.json in the package
tree, mirrored to static/). The registry is the single source of
truth for alt text and file paths.

module_name is resolved the same way as in the effects router.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.module import Module
from neurocad.core.models.balance import Balance

from .schema import (
    CoreEngineLibWordImagesCreateRequest,
    CoreEngineLibWordImagesGenerateRequest,
)
from .service import CoreEngineLibWordImagesService


router = APIRouter(
    prefix="/images",
    tags=["core/engine/lib/word/editor/images"],
)


# ============================================
# MODULE RESOLUTION
# ============================================
#
# Same as in the effects router. Kept local for the same reasons.

def _module_name(request: Request) -> str:
    module_name = request.query_params.get("module")
    if module_name:
        return module_name

    referer = request.headers.get("referer", "")
    if "/core/engine/" in referer:
        module_name = referer.split("/core/engine/", 1)[1].split("/")[0]
        if module_name:
            return module_name

    raise HTTPException(status_code=400, detail="Module not resolved")


async def _verify_module(request: Request) -> str:
    module_name = _module_name(request)

    async for session in get_db_sqlite():
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()

        if not module:
            raise HTTPException(
                status_code=404,
                detail=f"Module {module_name} not found",
            )
        return module_name

    raise HTTPException(status_code=500, detail="DB error")


# ============================================
# BALANCE CHARGE (logo generation)
# ============================================

async def _charge_logo(
    user_id: int,
    provider,
    log=None,
) -> None:
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

            # pro — also charge one generation.
            if bal.tarif == 1:
                bal.gen = max(0, (bal.gen or 0) - 1)

            bal.updated_at = datetime.now()
            await session.commit()

            if log is not None:
                try:
                    log.log_info_sync(
                        target="images-generate",
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
                    target="images-generate",
                    message=f"charge failed for user {user_id}: {e}",
                )
            except Exception:
                pass


# ============================================
# LIST IMAGES
# ============================================

@router.get("")
async def list_images(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all images from the registry.

    Example:
      GET /core/engine/lib/word/editor/images?module=aleksmir.ru

    Returns entries sorted by `order`, then by `id`. Entries whose
    SVG file is missing on disk are skipped.

    Any authenticated user.
    """
    await _verify_module(request)

    try:
        items = CoreEngineLibWordImagesService.list_images()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read images registry: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": items,
    })


# ============================================
# CREATE IMAGE
# ============================================

@router.post("")
async def create_image(
    data: CoreEngineLibWordImagesCreateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Create a new image from a complete <svg>...</svg> string.

    Writes files/<id>.svg and appends an entry to the registry, both
    atomically, in package + static trees.

    Example:
      POST /core/engine/lib/word/editor/images?module=aleksmir.ru
      body: {
        "svg": "<svg viewBox='0 0 800 600'>...</svg>",
        "alt": "Родовое поместье на закате",
        "source": "llm"
      }

    Any authenticated user.
    """
    await _verify_module(request)

    try:
        result = CoreEngineLibWordImagesService.create_image(
            svg=data.svg,
            alt=data.alt,
            source=data.source,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create image: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# GENERATE IMAGE
# ============================================
#
# NOTE: this route MUST be declared BEFORE the `GET /{image_id}`
# route below. FastAPI matches routes in the order they are added;
# if `/{image_id}` came first, a request to /images/generate would
# be interpreted as image_id="generate" and fail validation.
#
# The endpoint:
#   0. balance guard (logo_allowed) — tariff + tokens + gen;
#   1. resolves the LLM provider (same factory as the WebSocket flow);
#   2. runs the "generate_logo" agent (prompt → SVG);
#   3. saves the SVG through CoreEngineLibWordImagesService;
#   4. charges tokens (+1 gen on pro) to Balance;
#   5. returns { id, file, url, bytes }.
#
# The agent is NOT registered in _AGENTS and is NOT called by the
# WebSocket dispatcher — the logo flow is HTTP-only.

@router.post("/generate")
async def generate_image(
    data: CoreEngineLibWordImagesGenerateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Generate a new SVG from a prompt, save it to the registry,
    and return its id + public URL.

    Example:
      POST /core/engine/lib/word/editor/images/generate?module=aleksmir.ru
      body: {
        "prompt": "Нейрокад — CMS нового поколения",
        "alt": "Нейрокад",
        "source": "logo"
      }

    Any authenticated user, but limited by tariff:
      - free        → 403 llm_not_available
      - tokens <= 0 → 403 tokens_exhausted
      - pro gen <= 0 → 403 gen_exhausted
    """
    await _verify_module(request)

    log = getattr(request.app.state, "log", None)

    # ---- 0. Balance guard ----
    from neurocad.core.engine.lib.balance.checked import BalanceChecked

    user_id = int(current_user.get("id"))
    bal, err = await BalanceChecked.logo_allowed(user_id, log=log)
    if err:
        # Map error code to a human-readable detail.
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

    # ---- 1. Resolve the LLM provider ----
    # Same factory the WebSocket flow uses, so the same settings /
    # mock switch apply here too.
    try:
        from .......utils.llm.factory import get_provider
        provider = await get_provider(log=log)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get LLM provider: {e}",
        )

    # ---- 2. Run the agent ----
    # Imported lazily so this module stays importable when the LLM
    # stack is not configured.
    from ...llm.agent.generate_logo import (
        CoreEngineLibWordLlmAgentGenerateLogo,
    )

    agent = CoreEngineLibWordLlmAgentGenerateLogo()
    try:
        result = await agent.run(
            provider=provider,
            user_message=data.prompt,
            page_id=0,
            run_id=None,
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

    # ---- 3. Save to the registry ----
    try:
        saved = CoreEngineLibWordImagesService.create_image(
            svg=svg,
            alt=data.alt or "",
            source=data.source or "logo",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save image: {e}",
        )

    # ---- 4. Charge tokens (+1 gen on pro) ----
    await _charge_logo(user_id=user_id, provider=provider, log=log)

    # ---- 5. Public URL ----
    # Same path nginx serves the rest of editor/images/ from.
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


# ============================================
# GET ONE IMAGE (metadata)
# ============================================

@router.get("/{image_id}")
async def get_image(
    image_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return the registry entry for a single image.

    Example:
      GET /core/engine/lib/word/editor/images/img-a1b2c3d4?module=aleksmir.ru

    Any authenticated user.
    """
    await _verify_module(request)

    item = CoreEngineLibWordImagesService.read_image(image_id)
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Image {image_id} not found",
        )

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# DELETE ONE IMAGE
# ============================================

@router.delete("/{image_id}")
async def delete_image(
    image_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete an image.

    Removes the SVG file from package + static trees and removes the
    registry entry from both.

    Example:
      DELETE /core/engine/lib/word/editor/images/img-a1b2c3d4?module=aleksmir.ru

    Any authenticated user.
    """
    await _verify_module(request)

    try:
        result = CoreEngineLibWordImagesService.delete_image(image_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete image: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })