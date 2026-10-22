# core/engine/lib/llm/agents/_03_none/service.py

from typing import Any, Dict
from .prompt import CoreEngineLibLlmAgentsNonePrompt

class CoreEngineLibLlmAgentsNoneService:
    """
    Agent: none.
    The request is not related to the NeuroCad editor. No LLM call is made.
    """

    @classmethod
    async def generate(cls, **kwargs) -> Dict[str, Any]:
        return {
            "message": CoreEngineLibLlmAgentsNonePrompt.build(),
            "html": None,
            "selector": None,
            "element_html": None,
        }