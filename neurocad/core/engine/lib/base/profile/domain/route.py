# neurocad/core/engine/lib/base/profile/domain/route.py

"""
Domain routes.

Endpoints (mounted under /core/engine/lib/base/profile/domain):
    GET    /                  — subdomain + custom slot + Caddy status
                                + pages + home_page_id
                                + robots_2 + robots_3
                                + policy + rules
    POST   /add               — set custom domain (checks DNS + Caddy)
    DELETE /remove            — clear the custom domain slot
    POST   /home              — set the home page (users.home_page_id)
    DELETE /home              — clear the home page
    POST   /robots            — save users.robots_2 or users.robots_3
                                (which one is chosen by `which`)
    POST   /legal             — save users.policy or users.rules
                                (which one is chosen by `which`)
    POST   /legal/generate    — generate a fresh policy / rules text
                                from the user's home page via the LLM
                                (nothing is saved — the caller gets
                                the text back and decides)
    GET    /sitemap           — sitemap.xml for the current user,
                                generated on the fly, returned as
                                text/plain for the in-admin modal

Full URLs:
    GET    /core/engine/lib/base/profile/domain/
    POST   /core/engine/lib/base/profile/domain/add
    DELETE /core/engine/lib/base/profile/domain/remove
    POST   /core/engine/lib/base/profile/domain/home
    DELETE /core/engine/lib/base/profile/domain/home
    POST   /core/engine/lib/base/profile/domain/robots
    POST   /core/engine/lib/base/profile/domain/legal
    POST   /core/engine/lib/base/profile/domain/legal/generate
    GET    /core/engine/lib/base/profile/domain/sitemap

All endpoints require an authenticated user.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from neurocad.core.auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibBaseProfileDomainAddRequest,
    CoreEngineLibBaseProfileDomainHomeSetRequest,
    CoreEngineLibBaseProfileDomainSetRobotsRequest,
    CoreEngineLibBaseProfileDomainSetLegalRequest,
    CoreEngineLibBaseProfileDomainGenerateLegalRequest,
)
from .service.facade import CoreEngineLibBaseProfileDomainService


router = APIRouter(prefix="/domain", tags=["core/engine/lib/base/profile/domain"])


def _require_user(current_user: dict) -> dict:
    if not current_user or not current_user.get("id"):
        raise HTTPException(status_code=401, detail="Не авторизован")
    return current_user


# ============================================
# READ
# ============================================

@router.get("/")
async def get_domains(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Free subdomain + custom domain slot + Caddy availability
    + the user's pages (for the home-page selector) + home_page_id
    + the current robots_2 and robots_3 texts (for the robots.txt
    modal, which edits whichever field the user opened)
    + the current policy and rules markdown texts (for the legal
    modal, same pattern).
    """
    user = _require_user(current_user)

    data = await CoreEngineLibBaseProfileDomainService.get_for_user(
        user_id=int(user["id"]),
        login=user.get("login") or "",
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        "data": data.model_dump(mode="json"),
    })


# ============================================
# ADD
# ============================================

@router.post("/add")
async def add_domain(
    body: CoreEngineLibBaseProfileDomainAddRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Set a custom domain.

    Errors:
      400 — invalid domain string
      409 — domain already used by another user
    """
    user = _require_user(current_user)

    data, err = await CoreEngineLibBaseProfileDomainService.add_custom(
        user_id=int(user["id"]),
        raw_domain=body.domain,
        log=request.app.state.log,
    )

    if err == "invalid":
        raise HTTPException(status_code=400, detail="Некорректное имя домена")
    if err == "duplicate":
        raise HTTPException(status_code=409, detail="Этот домен уже подключён другим пользователем")

    return JSONResponse({
        "success": True,
        "data": data.model_dump(mode="json"),
    })


# ============================================
# REMOVE
# ============================================

@router.delete("/remove")
async def remove_domain(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Clear the custom domain slot."""
    user = _require_user(current_user)

    ok = await CoreEngineLibBaseProfileDomainService.remove_custom(
        user_id=int(user["id"]),
        log=request.app.state.log,
    )

    return JSONResponse({"success": True, "removed": ok})


# ============================================
# HOME PAGE — SET
# ============================================

@router.post("/home")
async def set_home_page(
    body: CoreEngineLibBaseProfileDomainHomeSetRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Set the user's home page.

    Body:
      { "page_id": 6 }

    The page must belong to one of the current user's non-deleted
    navs; otherwise 400 is returned.

    Response:
      { "success": true, "data": { "home_page_id": 6 } }

    Errors:
      400 — page does not belong to this user (or is deleted)
      404 — user not found
    """
    user = _require_user(current_user)

    page_id, err = await CoreEngineLibBaseProfileDomainService.set_home_page(
        user_id=int(user["id"]),
        page_id=body.page_id,
        log=request.app.state.log,
    )

    if err == "invalid":
        raise HTTPException(
            status_code=400,
            detail="Эта страница не принадлежит вам или удалена",
        )
    if err == "not_found":
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": {"home_page_id": page_id},
    })


# ============================================
# HOME PAGE — CLEAR
# ============================================

@router.delete("/home")
async def clear_home_page(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Clear the user's home page.

    After this call, "/" on the user's subdomain falls back to the
    first page (ORDER BY datetime ASC) — same logic as before the
    home page was ever set.

    Response:
      { "success": true, "data": { "home_page_id": null } }
    """
    user = _require_user(current_user)

    await CoreEngineLibBaseProfileDomainService.clear_home_page(
        user_id=int(user["id"]),
        log=request.app.state.log,
    )

    return JSONResponse({
        "success": True,
        "data": {"home_page_id": None},
    })


# ============================================
# ROBOTS.TXT — SAVE
# ============================================

@router.post("/robots")
async def set_robots(
    body: CoreEngineLibBaseProfileDomainSetRobotsRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save a robots.txt body for the current user.

    Body:
      {
        "which": "2",
        "robots": "User-agent: *\\nDisallow: /\\n"
      }

    `which` selects the target field:

      - "2" → users.robots_2 (custom second-level domain);
      - "3" → users.robots_3 (free third-level subdomain).

    The text is stored verbatim — the backend does not parse or
    validate robots.txt syntax. Empty string is stored as-is.

    Response:
      {
        "success": true,
        "data": { "which": "2", "robots": "<saved text>" }
      }

    Errors:
      400 — invalid `which`
      404 — user not found
    """
    user = _require_user(current_user)

    saved = await CoreEngineLibBaseProfileDomainService.set_robots(
        user_id=int(user["id"]),
        which=body.which,
        text=body.robots,
        log=request.app.state.log,
    )

    if saved is None:
        # set_robots returns None either because the user does not
        # exist or because `which` was outside {"2", "3"}. The
        # Pydantic schema already constrains `which`, so the only
        # remaining case is "user not found".
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": {"which": body.which, "robots": saved},
    })


# ============================================
# LEGAL — POLICY / RULES SAVE
# ============================================

@router.post("/legal")
async def set_legal(
    body: CoreEngineLibBaseProfileDomainSetLegalRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save a policy or rules markdown body for the current user.

    Body:
      {
        "which": "policy",
        "text": "# Политика обработки персональных данных\\n\\n..."
      }

    `which` selects the target field:

      - "policy" → users.policy;
      - "rules"  → users.rules.

    The text is stored verbatim — the backend does not parse or
    validate markdown. Empty string is stored as-is (distinct from
    NULL in the DB: "" means the user cleared the field on purpose).

    The public endpoints /policy and /rules (see utils/routes.py)
    read these fields by Host and render them to HTML on the fly.

    Response:
      {
        "success": true,
        "data": { "which": "policy", "text": "<saved text>" }
      }

    Errors:
      400 — invalid `which`
      404 — user not found
    """
    user = _require_user(current_user)

    saved = await CoreEngineLibBaseProfileDomainService.set_legal(
        user_id=int(user["id"]),
        which=body.which,
        text=body.text,
        log=request.app.state.log,
    )

    if saved is None:
        # set_legal returns None either because the user does not
        # exist or because `which` was outside {"policy", "rules"}.
        # The Pydantic schema already constrains `which`, so the
        # only remaining case is "user not found".
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return JSONResponse({
        "success": True,
        "data": {"which": body.which, "text": saved},
    })


# ============================================
# LEGAL — POLICY / RULES GENERATE
# ============================================

@router.post("/legal/generate")
async def generate_legal(
    body: CoreEngineLibBaseProfileDomainGenerateLegalRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Generate a policy or rules markdown body from the user's home
    page, and return it to the frontend. NOTHING is saved here —
    the user reviews the text in the modal and decides whether to
    save it via POST /domain/legal.

    Body:
      { "which": "policy" | "rules" }

    The flow:
      1. balance guard (same as logo generation) — tariff + tokens;
      2. load the user's home page (users.home_page_id, or the first
         page by datetime ASC in the user's first nav) and extract
         its visible text (HTML stripped, trimmed);
      3. resolve the LLM provider (same factory as the WS flow);
      4. run the generate_legal agent — policy or rules, based on
         `which`;
      5. charge tokens (+1 gen on pro) to Balance;
      6. return { which, text }.

    Errors:
      400 — user has no pages (nothing to base the document on)
      403 — tariff blocks LLM (free) or tokens exhausted
      500 — LLM error, provider error, or unexpected exception
    """
    user = _require_user(current_user)
    user_id = int(user["id"])
    log = request.app.state.log

    # ---- 0. Balance guard ----
    from neurocad.core.engine.lib.balance.checked import BalanceChecked

    bal, err = await BalanceChecked.logo_allowed(user_id, log=log)
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

    # ---- 1. Load the home page context ----
    ctx = await CoreEngineLibBaseProfileDomainService.load_home_context(user_id)
    if ctx is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Не удалось найти главную страницу. "
                "Создайте хотя бы одну страницу и попробуйте снова."
            ),
        )

    # ---- 2. Resolve the LLM provider ----
    try:
        from neurocad.utils.llm.factory import get_provider
        provider = await get_provider(log=log)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get LLM provider: {e}",
        )

    # ---- 3. Run the agent ----
    from neurocad.core.engine.lib.word.llm.agent.generate_legal import (
        CoreEngineLibWordLlmAgentGenerateLegal,
    )

    agent = CoreEngineLibWordLlmAgentGenerateLegal()
    try:
        result = await agent.run(
            provider=provider,
            which=body.which,
            owner_name=ctx["owner_name"],
            home_title=ctx["title"],
            home_desc=ctx["description"],
            home_text=ctx["text"],
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation error: {e}",
        )

    text = result.get("text")
    if not text:
        raise HTTPException(
            status_code=500,
            detail=result.get("error") or "Не удалось сгенерировать текст.",
        )

    # ---- 4. Charge tokens (+1 gen on pro) ----
    # Same accounting as the images router — kept local to this
    # route so the domain router does not depend on that package.
    try:
        from datetime import datetime as _dt
        from sqlalchemy import select as _select
        from neurocad.core.models.balance import Balance as _Balance
        from neurocad.utils.sqlite import get_db_sqlite as _get_db

        usage = int(getattr(provider, "tokens_used", 0) or 0)
        async for session in _get_db():
            stmt = _select(_Balance).where(
                _Balance.user_id == user_id,
                _Balance.is_delete.is_(False),
            )
            b = (await session.execute(stmt)).scalar_one_or_none()
            if b is not None:
                if usage > 0:
                    b.tokens = max(0, (b.tokens or 0) - usage)
                if b.tarif == 1:
                    b.gen = max(0, (b.gen or 0) - 1)
                b.updated_at = _dt.now()
                await session.commit()
            break
    except Exception as e:
        try:
            log.log_warning_sync(
                target="legal-generate",
                message=f"charge failed for user {user_id}: {e}",
            )
        except Exception:
            pass

    return JSONResponse({
        "success": True,
        "data": {
            "which": body.which,
            "text": text,
        },
    })


# ============================================
# SITEMAP.XML — VIEW (admin-side, for the modal)
# ============================================

@router.get("/sitemap")
async def get_sitemap(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> PlainTextResponse:
    """
    sitemap.xml for the currently authenticated user, generated on
    the fly from the `pages` table (nothing is stored — see
    SitemapMixin.build_sitemap).

    Returns text/plain, NOT application/xml, on purpose:

      - this endpoint serves the in-admin SitemapModal (a <pre>
        viewer), so a plain-text body is what we want;
      - the PUBLIC sitemap — the one search engines crawl — is
        served at https://<user-host>/sitemap.xml with
        Content-Type: application/xml, by a separate route (see
        utils/routes.py). Both endpoints call the same
        build_sitemap() and produce byte-identical XML; only the
        headers differ.

    We deliberately do NOT make this endpoint return application/xml:
    if it did, a browser navigating to it during debugging would
    download the file instead of rendering it inline — awkward when
    the whole point is to eyeball the XML.

    Cache-Control is no-store so that a page created / edited /
    deleted between two modal opens is reflected immediately, and
    no intermediate proxy caches a stale sitemap.

    Errors:
      401 — not authenticated (handled by _require_user)
    """
    user = _require_user(current_user)

    xml = await CoreEngineLibBaseProfileDomainService.build_sitemap(
        user_id=int(user["id"]),
    )

    return PlainTextResponse(
        content=xml,
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-store, must-revalidate",
            # The sitemap itself must not be indexed — it is a
            # crawler input, not a page.
            "X-Robots-Tag": "noindex",
        },
    )