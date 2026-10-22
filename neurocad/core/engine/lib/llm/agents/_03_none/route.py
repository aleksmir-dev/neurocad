# core/engine/lib/llm/agents/_03_none/route.py

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ......auth.dependencies import get_current_user
from .schema import (
    CoreEngineLibLlmAgentsNoneRequest,
    CoreEngineLibLlmAgentsNoneResponse,
)
from .service import CoreEngineLibLlmAgentsNoneService

router = APIRouter(
    prefix="/_03_none",
    tags=["core/engine/lib/llm/agents/_03_none"],
)

@router.post("/generate")
async def generate_none_response(
    data: CoreEngineLibLlmAgentsNoneRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Returns a canned "off-topic" message.
    """
    result = await CoreEngineLibLlmAgentsNoneService.generate()

    return JSONResponse({
        "success": True,
        "message": result["message"]
    })