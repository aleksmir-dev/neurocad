# core/engine/lib/llm/agents/_04_personal/route.py

"""HTTP routes for the _04_personal agent."""

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
    Generate a personal page (HTML + CSS) by stage.

    - stage="brief":   диалог, возвращает {question, ready, state}.
    - stage="base":    макет, возвращает {html, css, css_by_section, state}.
    - stage="effects": одна секция, возвращает {html, css, css_by_section, section, state}.

    Клиент передаёт `state` из предыдущего ответа — сервер не хранит
    состояние между запросами. Если `state` нет, но есть `run_id`,
    сервер загрузит state из Run.
    """
    # 1. LLM provider
    try:
        provider = await get_provider()
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Провайдер LLM недоступен: {e}"},
        )

    # 2. Service
    try:
        result = await CoreEngineLibLlmAgentsPersonalService.generate(
            provider=provider,
            request=data,
            user=current_user,
        )
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(e)},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Ошибка генерации: {e}"},
        )

    return JSONResponse({"success": True, "data": result})