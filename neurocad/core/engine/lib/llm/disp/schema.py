# core/engine/lib/llm/disp/schema.py

from pydantic import BaseModel
from typing import Any, Dict, List, Optional

class CoreEngineLibLlmDispRequest(BaseModel):
    user_message: str
    selection: Optional[Dict[str, Any]] = None
    current_html: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None

class CoreEngineLibLlmDispResponse(BaseModel):
    type: str  # "question", "message", "html", "error"
    message: Optional[str] = None
    html: Optional[str] = None
    css: Optional[str] = None