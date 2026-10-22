# core/engine/lib/llm/agents/_02_router/service.py

import json
from typing import Any, Dict, List, Optional

from .prompt import CoreEngineLibLlmAgentsRouterPrompt

class CoreEngineLibLlmAgentsRouterService:
    """
    Router service: decides which agent handles the request.
    """
    
    # Список агентов, между которыми выбирает роутер.
    # 01_logo здесь НЕТ, так как он вызывается отдельно (по кнопке).
    AGENTS: Dict[str, str] = {
        "none": (
            "Запрос не связан с созданием личной страницы: анекдоты, погода, "
            "политика, математика, посторонние разговоры. Сюда же попадают вопросы "
            "про работу самого редактора (как сохранить, как поменять цвет)."
        ),
        "personal": (
            "Создать персональную страницу (сайт-визитку, портфолио). "
            "Запросы вроде: 'сделай мой личный сайт', 'хочу страницу с моими проектами', "
            "'сайт-визитка для меня'."
        ),
    }

    @classmethod
    def _build_state(cls, selection: Optional[Dict[str, Any]], current_html: Optional[str]) -> str:
        lines = []
        if selection and selection.get("selector"):
            tag = selection.get("tag") or "?"
            classes = selection.get("classes") or []
            cls_str = ", ".join(str(c) for c in classes) if classes else "—"
            lines.append(f"- выделен элемент: <{tag}> с классами: {cls_str}")
        elif selection and selection.get("block_id"):
            lines.append(f"- выделен блок: {selection['block_id']}")
        else:
            lines.append("- выделен элемент: нет")

        if current_html and current_html.strip():
            lines.append("- страница уже есть: да (её можно редактировать)")
        else:
            lines.append("- страница уже есть: нет (пустая)")
        return "\n".join(lines)

    @classmethod
    def _extract_dialog(cls, history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        if not history:
            return []
        start_idx = 0
        for i in range(len(history) - 1, -1, -1):
            m = history[i]
            if m.get("role") == "assistant" and not m.get("is_quest"):
                start_idx = i + 1
                break
        return history[start_idx:]

    @classmethod
    def _is_last_assistant_question(cls, history: Optional[List[Dict[str, Any]]]) -> bool:
        if not history:
            return False
        for m in reversed(history):
            if m.get("role") == "assistant":
                return bool(m.get("is_quest"))
            if m.get("role") == "user":
                continue
        return False

    @classmethod
    def _format_dialog(cls, dialog: List[Dict[str, Any]]) -> str:
        if not dialog:
            return "(диалога нет)"
        lines = []
        for m in dialog:
            role = m.get("role") or "?"
            content = (m.get("content") or "").strip()
            if not content:
                continue
            if len(content) > 500:
                content = content[:500] + "…"
            if role == "user":
                lines.append(f"  user: {content}")
            elif role == "assistant":
                marker = " [вопрос]" if m.get("is_quest") else ""
                lines.append(f"  assistant{marker}: {content}")
        return "\n".join(lines) if lines else "(диалога нет)"

    @classmethod
    def _extract_json(cls, text: str) -> Optional[dict]:
        if not text:
            return None
        s = text.strip()
        if s.startswith("```"):
            first_nl = s.find("\n")
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(s[start:end + 1])
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass
        return None

    @classmethod
    async def route(
        cls,
        provider,
        user_message: str,
        selection: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        history: Optional[List[Dict[str, Any]]] = None,
        run_id: Any = None,
        emit=None,
        system_prompt: Optional[str] = None,  # <-- ДОБАВЛЕНО
    ) -> Dict[str, Any]:
        """
        Возвращает:
          {"agent": "<name>", "question": None}
          {"agent": None, "question": "<text>"}
          {"agent": None, "question": None} — ошибка
        """
        history = history or []

        if emit:
            await emit({"type": "step", "step": "routing", "message": "Определяю действие..."})

        agents_block = "\n".join(f"- {name}: {desc}" for name, desc in cls.AGENTS.items())
        state_block = cls._build_state(selection, current_html)
        
        is_reply = cls._is_last_assistant_question(history)

        # Если передан кастомный промпт — используем его
        if system_prompt:
            final_prompt = system_prompt
        else:
            if is_reply:
                dialog = cls._extract_dialog(history)
                dialog_block = cls._format_dialog(dialog)
                final_prompt = CoreEngineLibLlmAgentsRouterPrompt.build_pick(
                    agents=agents_block, state=state_block, dialog=dialog_block, user_message=user_message
                )
            else:
                final_prompt = CoreEngineLibLlmAgentsRouterPrompt.build_ask(
                    agents=agents_block, state=state_block, user_message=user_message
                )

        messages = [
            {"role": "system", "content": final_prompt},
            {"role": "user", "content": user_message},
        ]

        try:
            raw = await provider.generate_completion(messages)
        except Exception:
            return {"agent": None, "question": None}

        data = cls._extract_json(raw)
        if not data:
            return {"agent": None, "question": None}

        if is_reply:
            if data.get("new_request"):
                return await cls._ask(provider, user_message, agents_block, state_block, run_id, emit)
            
            agent = str(data.get("agent", "")).strip()
            if agent not in cls.AGENTS:
                agent = "none"
            return {"agent": agent, "question": None}
        else:
            question = str(data.get("question", "")).strip()
            if not question:
                return {"agent": None, "question": None}
            return {"agent": None, "question": question}

    @classmethod
    async def _ask(cls, provider, user_message, agents_block, state_block, run_id, emit) -> Dict[str, Any]:
        system_prompt = CoreEngineLibLlmAgentsRouterPrompt.build_ask(
            agents=agents_block, state=state_block, user_message=user_message
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        try:
            raw = await provider.generate_completion(messages)
        except Exception:
            return {"agent": None, "question": None}

        data = cls._extract_json(raw)
        if not data:
            return {"agent": None, "question": None}

        question = str(data.get("question", "")).strip()
        if not question:
            return {"agent": None, "question": None}
        return {"agent": None, "question": question}