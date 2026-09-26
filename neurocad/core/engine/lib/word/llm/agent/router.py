# neurocad/core/engine/lib/word/llm/agent/router.py

"""
Router — decides which agent handles the request.

One short LLM call. Input: user message + state (selection, page
presence). Output: {"agent": "<name>", "target": "<selector | null>"}.

The router does NOT edit the page. It only picks the next agent.
If the request is off-topic, it returns "none" so no further LLM
tokens are spent.

Selection format
----------------
The client sends `selection` in one of two shapes:

  1. Element marker (preferred):
       {"selector": "sel-abc12345", "tag": "section",
        "classes": ["section", "hero"], "outer_html": "..."}

  2. Block id (legacy, may still arrive from older clients):
       {"block_id": "core-hero"}

The router trusts `selector` first. `block_id` is treated as a
fallback and only used if `selector` is absent.

Image requests
--------------
The `effect` agent handles TWO kinds of requests:

  - visual effects — backgrounds, gradients, animations, shadows,
    hover states (writes a <style> block);
  - image generation — "нарисуй картинку", "сгенерируй иллюстрацию",
    "сделай svg", "замени картинку" (replaces a placeholder <img>
    with a generated inline <svg>).

The `effect` agent picks the right mode itself (by looking at the
user message), so the router does not have to distinguish between
the two. It only has to route BOTH to `effect`, NOT to `fill`.
That is what rule 7 in SYSTEM_PROMPT enforces.

Logging: uses provider.log (app.state.log, passed via the provider).
"""

import json
from typing import Any, Dict, Optional


class CoreEngineLibWordLlmRouter:
    """Pick the right agent for a user request."""

    #: Available agents with short descriptions for the prompt.
    AGENTS = {
        "create": "Создать новую страницу с нуля или полностью пересобрать её",
        "fill":   "Заполнить выделенный элемент текстом, alt'ами, ссылками (НЕ картинками)",
        "effect": "Добавить визуальные эффекты ИЛИ сгенерировать картинку/SVG для выделенного элемента",
        "help":   "Вопрос про сам редактор NeuroCad (как работает, что умеет)",
        "none":   "Запрос не связан с редактором NeuroCad",
    }

    #: System prompt for the router. Kept small on purpose — it is
    #: called on every user message.
    SYSTEM_PROMPT = """Ты — маршрутизатор запросов в редакторе страниц NeuroCad.

Твоя задача — выбрать ОДИН агент, который обработает запрос пользователя.

ДОСТУПНЫЕ АГЕНТЫ:
{agents}

СОСТОЯНИЕ РЕДАКТОРА:
{state}

ПРАВИЛА:
1. Ответь ТОЛЬКО валидным JSON, без markdown и пояснений.
2. Формат: {{"agent": "<имя>", "target": "<selector | null>"}}
3. Поле "target" заполняй ТОЛЬКО если агент работает с выделенным
   элементом (fill, effect). Скопируй туда значение `selector` из
   состояния редактора дословно.
4. Если запрос не связан с редактором NeuroCad (анекдоты, общие вопросы,
   погода, политика и т.п.) — верни "none".
5. Если пользователь просит изменить/дополнить существующую страницу
   (а не собрать заново) — используй соответствующий агент, не create.
6. Если непонятно — верни "help".
7. Если пользователь просит НАРИСОВАТЬ / СГЕНЕРИРОВАТЬ / СДЕЛАТЬ
   картинку, изображение, иллюстрацию, SVG, "заменить плейсхолдер на
   картинку" — верни agent="effect", даже если в запросе есть слово
   "заполни" или "сделай". Это НЕ fill.

ПРИМЕРЫ:
- "Сделай лендинг для салона" → {{"agent": "create", "target": null}}
- "Заполни выделенный блок" → {{"agent": "fill", "target": "sel-abc12345"}}
- "Заполни блок текстом про компанию" → {{"agent": "fill", "target": "sel-abc12345"}}
- "Сделай анимацию внутри этого блока" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Добавь градиентный фон выделенному" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Нарисуй картинку вместо плейсхолдера" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Сгенерируй иллюстрацию для этой картинки" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Замени эту картинку на SVG" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Как сохранить пресет?" → {{"agent": "help", "target": null}}
- "Расскажи анекдот" → {{"agent": "none", "target": null}}
"""

    # ============================================
    # LOG HELPER
    # ============================================

    @staticmethod
    def _log(provider, level: str, message: str) -> None:
        """Write through provider.log if available, else silently."""
        log = getattr(provider, "log", None)
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="router", message=message)
        except Exception:
            pass

    # ============================================
    # STATE
    # ============================================

    @staticmethod
    def _build_state(
        selection: Optional[Dict[str, Any]],
        current_html: Optional[str],
    ) -> str:
        """
        Render the editor state as a short block of text for the router.

        Priority:
          1. `selector` — element marker from the new client.
          2. `block_id` — legacy block id, kept for older clients.
          3. nothing selected.
        """
        lines = []

        if selection and selection.get("selector"):
            tag = selection.get("tag") or "?"
            classes = selection.get("classes") or []
            cls = ", ".join(str(c) for c in classes) if classes else "—"
            lines.append(f"- выделен элемент: <{tag}> с классами: {cls}")
            lines.append(f"- selector: {selection['selector']}")
        elif selection and selection.get("block_id"):
            lines.append(f"- выделен блок: {selection['block_id']}")
        else:
            lines.append("- выделен элемент: нет")

        if current_html:
            lines.append("- страница уже есть: да")
        else:
            lines.append("- страница уже есть: нет (пустая)")

        return "\n".join(lines)

    # ============================================
    # ROUTE
    # ============================================

    @staticmethod
    async def route(
        provider,
        user_message: str,
        selection: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        run_id: Any = None,
        emit=None,
    ) -> Dict[str, Any]:
        """
        Ask the LLM which agent should handle the request.

        Returns {"agent": "<name>", "target": "<selector | null>"}.
        On any failure, falls back to {"agent": "help", "target": None}.

        `emit` is an optional async callback used to send intermediate
        progress events to the client. If provided, a single `step`
        event is emitted before the LLM call.
        """
        # ---- emit: step before LLM ----
        if emit:
            await emit({
                "type": "step",
                "step": "routing",
                "message": "Определяю действие...",
            })

        agents_block = "\n".join(
            f"- {name}: {desc}"
            for name, desc in CoreEngineLibWordLlmRouter.AGENTS.items()
        )
        state_block = CoreEngineLibWordLlmRouter._build_state(selection, current_html)

        system_prompt = CoreEngineLibWordLlmRouter.SYSTEM_PROMPT.format(
            agents=agents_block,
            state=state_block,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        # ---- dump router request ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="router",
                system_prompt=system_prompt,
                user_content=user_message,
            )
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(provider, "warning", f"dump request failed: {e}")

        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(provider, "error", f"LLM error: {e}")
            return {"agent": "help", "target": None}

        # ---- dump router response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="router",
                raw_response=raw,
            )
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(provider, "warning", f"dump response failed: {e}")

        # ---- parse ----
        data = CoreEngineLibWordLlmRouter._extract_json(raw)
        if not data:
            CoreEngineLibWordLlmRouter._log(provider, "warning", f"failed to parse response: {raw!r}")
            return {"agent": "help", "target": None}

        agent = str(data.get("agent", "help")).strip()
        target = data.get("target")
        if target is not None:
            target = str(target).strip() or None

        # ---- validate agent name ----
        if agent not in CoreEngineLibWordLlmRouter.AGENTS:
            CoreEngineLibWordLlmRouter._log(provider, "warning", f"unknown agent {agent!r}, falling back to help")
            agent = "help"
            target = None

        result = {"agent": agent, "target": target}
        CoreEngineLibWordLlmRouter._log(provider, "info", f"{user_message!r} -> {result}")
        return result

    # ============================================
    # PARSING
    # ============================================

    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        """Tolerant JSON extraction — same pattern as in step.py."""
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