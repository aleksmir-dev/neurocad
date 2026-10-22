# core/engine/lib/llm/agents/_02_router/route.py

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ......auth.dependencies import get_current_user
from .......utils.llm.factory import get_provider
from .schema import (
    CoreEngineLibLlmAgentsRouterRequest,
    CoreEngineLibLlmAgentsRouterResponse,
)
from .service import CoreEngineLibLlmAgentsRouterService

router = APIRouter(
    prefix="/_02_router",
    tags=["core/engine/lib/llm/agents/_02_router"],
)

@router.post("/route", response_model=CoreEngineLibLlmAgentsRouterResponse)
async def route_request(
    data: CoreEngineLibLlmAgentsRouterRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Decide which agent to call or ask a clarifying question.
    """
    # Получаем LLM-провайдер
    try:
        provider = await get_provider()
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to get LLM provider: {e}"}
        )

    # Вызываем сервис роутера
    try:
        result = await CoreEngineLibLlmAgentsRouterService.route(
            provider=provider,
            user_message=data.user_message,
            selection=data.selection,
            current_html=data.current_html,
            history=data.history,
            system_prompt=data.system_prompt,
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Router error: {e}"}
        )

    # Возвращаем результат
    return JSONResponse({
        "success": True,
        "data": result
    })