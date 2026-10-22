# core/engine/lib/llm/disp/route.py

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .....auth.dependencies import get_current_user
from .schema import CoreEngineLibLlmDispRequest, CoreEngineLibLlmDispResponse
from .service import CoreEngineLibLlmDispService
from ......utils.llm.factory import get_provider

router = APIRouter(
    prefix="/disp",
    tags=["core/engine/lib/llm/disp"],
)

@router.post("/chat")
async def chat_endpoint(
    data: CoreEngineLibLlmDispRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    HTTP API для тестирования диспетчера.
    (В продакшене запросы идут через WebSocket).
    """
    provider = get_provider()
    
    result = await CoreEngineLibLlmDispService.handle_request(
        provider=provider,
        user_message=data.user_message,
        history=data.history,
        selection=data.selection,
        current_html=data.current_html,
    )

    return JSONResponse({
        "success": result["type"] != "error",
        "data": result
    })