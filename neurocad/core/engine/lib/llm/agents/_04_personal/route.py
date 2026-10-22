# core/engine/lib/llm/agents/_04_personal/route.py

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ......auth.dependencies import get_current_user
from .......utils.llm.factory import get_provider
from .schema import (
    CoreEngineLibLlmAgentsPersonalRequest,
    CoreEngineLibLlmAgentsPersonalResponse,
)
from .service import CoreEngineLibLlmAgentsPersonalService

router = APIRouter(
    prefix="/_04_personal",
    tags=["core/engine/lib/llm/agents/_04_personal"],
)


@router.post("/generate", response_model=CoreEngineLibLlmAgentsPersonalResponse)
async def generate_personal_page(
    data: CoreEngineLibLlmAgentsPersonalRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Generate a personal page (HTML + CSS) based on user prompt and stage.

    - stage="brief":   диалог с пользователем, возвращает {question, ready}.
    - stage="base":    генерирует полный макет, возвращает {html, css_by_section}.
    - stage="effects": обновляет одну секцию, возвращает {html, css, section}.
                       HTML и CSS относятся ТОЛЬКО к этой секции.
                       Клиент должен перезаписать ключ `section` в своём
                       словаре CSS по секциям.
    """
    # 1. Провайдер
    try:
        provider = await get_provider()
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to get LLM provider: {e}"},
        )

    # 2. Сервис
    try:
        result = await CoreEngineLibLlmAgentsPersonalService.generate(
            provider=provider,
            user_message=data.prompt,
            stage=data.stage,
            target_section=data.target_section,
            current_html=data.current_html,
            current_css=data.current_css,
            css_by_section=data.css_by_section,
            history=data.history,
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Generation error: {e}"},
        )

    if "error" in result:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": result["error"]},
        )

    # 3. Ответ по этапам
    if data.stage == "brief":
        return JSONResponse({
            "success": True,
            "data": {
                "question": result.get("question"),
                "ready": result.get("ready", False),
            },
        })

    if data.stage == "base":
        return JSONResponse({
            "success": True,
            "data": {
                "html": result["html"],
                # Словарь {hero: ..., projects: ..., footer: ...}
                "css_by_section": result["css_by_section"],
                # Удобная склейка для клиентов, которые ещё не перешли на словарь
                "css": result["css"],
            },
        })

    if data.stage == "effects":
        return JSONResponse({
            "success": True,
            "data": {
                "html": result["html"],       # HTML только этой секции
                "css": result["css"],         # CSS только этой секции
                "section": result["section"], # какую секцию обновлять
            },
        })

    return JSONResponse(
        status_code=400,
        content={"success": False, "error": f"Unknown stage: {data.stage}"},
    )