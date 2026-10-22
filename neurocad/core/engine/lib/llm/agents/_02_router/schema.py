# core/engine/lib/llm/agents/_02_router/schema.py

from pydantic import BaseModel
from typing import Any, Dict, List, Optional

class CoreEngineLibLlmAgentsRouterRequest(BaseModel):
    user_message: str
    selection: Optional[Dict[str, Any]] = None
    current_html: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None
    system_prompt: Optional[str] = None

class CoreEngineLibLlmAgentsRouterResponse(BaseModel):
    agent: Optional[str] = None
    question: Optional[str] = None