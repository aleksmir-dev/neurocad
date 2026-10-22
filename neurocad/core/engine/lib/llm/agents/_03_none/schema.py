# core/engine/lib/llm/agents/_03_none/schema.py

from pydantic import BaseModel

class CoreEngineLibLlmAgentsNoneRequest(BaseModel):
    prompt: str

class CoreEngineLibLlmAgentsNoneResponse(BaseModel):
    success: bool
    message: str