# core/engine/lib/llm/disp/service.py

from typing import Any, Dict, List, Optional
from ..agents._02_router.service import CoreEngineLibLlmAgentsRouterService
from ..agents._03_none.service import CoreEngineLibLlmAgentsNoneService
from ..agents._04_personal.service import CoreEngineLibLlmAgentsPersonalService
 
class CoreEngineLibLlmDispService:
    """
    Dispatcher.
    Принимает контекст, решает, какой агент нужен, и возвращает результат.
    Не знает ничего про WebSocket, HTTP или базы данных.
    """

    @classmethod
    async def handle_request(
        cls,
        *,
        provider: Any,
        user_message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        selection: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        emit: Optional[Any] = None,
    ) -> Dict[str, Any]:
        
        # 1. Спрашиваем роутер
        router_result = await CoreEngineLibLlmAgentsRouterService.route(
            provider=provider,
            user_message=user_message,
            selection=selection,
            current_html=current_html,
            history=history,
            emit=emit,
        )

        # 2. Если роутер решил задать уточняющий вопрос
        if router_result.get("question"):
            return {
                "type": "question",
                "message": router_result["question"],
            }

        # 3. Если роутер выбрал агента
        agent_name = router_result.get("agent")

        if agent_name == "none":
            result = await CoreEngineLibLlmAgentsNoneService.generate()
            return {
                "type": "message",
                "message": result["message"],
            }

        elif agent_name == "personal":
            result = await CoreEngineLibLlmAgentsPersonalService.generate(
                provider=provider,
                user_message=user_message,
            )
            
            if "error" in result:
                return {
                    "type": "error",
                    "message": result["error"],
                }
                
            return {
                "type": "html",
                "html": result["html"],
                "css": result["css"],
            }

        # 4. Если роутер вернул что-то неизвестное
        return {
            "type": "error",
            "message": f"Неизвестный агент: {agent_name}",
        }