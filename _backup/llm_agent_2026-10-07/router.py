# neurocad/core/engine/lib/word/llm/agent/router.py

"""
Router — decides which agent handles the request.

One short LLM call. Input: user message + state (selection, page
presence) + recent history. Output: {"agent": ..., "target": ...}.

Key responsibilities
--------------------
1. Pick the right agent for a NEW request (create / create_page /
   fill / effect / help / none).

2. Handle RETRY messages ("попробуй ещё раз", "повтори", "заново",
   "ещё раз"). The router sees recent history and knows what the
   user was trying — so it can route the retry to the same agent,
   instead of falling into `help`.

3. Handle EDIT requests for an existing page. `create_page` has two
   modes (create / edit); the router only decides "this is a page
   request", the agent picks its own mode from `current_html`.

Selection format
----------------
Client sends `selection` in one of two shapes:
  - {"selector": "sel-abc12345", "tag": "section", "classes": [...],
     "outer_html": "..."}   — preferred
  - {"block_id": "core-hero"} — legacy

`selector` wins; `block_id` is the fallback.

Image requests
--------------
`effect` handles both visual effects (backgrounds, gradients,
animations) AND image generation (draw / generate / replace an SVG).
The router only routes BOTH to `effect`, never to `fill`. Rule 7 in
SYSTEM_PROMPT enforces this.

Page generation — two flavours
------------------------------
`create`       — build a page from OUR ready blocks
                 (plan → fill → effects → svg).
`create_page`  — build OR edit a page in one LLM call with free-form
                 HTML+CSS. Pick it for creative / nonstandard pages,
                 or when the user asks to change an existing page.

Rule 8 in SYSTEM_PROMPT explains how to choose between the two.

Logging: uses provider.log (app.state.log, passed via the provider).
"""

import json
import re
from typing import Any, Dict, List, Optional


class CoreEngineLibWordLlmRouter:
    """Pick the right agent for a user request."""

    AGENTS = {
        "create":      "Собрать страницу ИЗ НАШИХ ГОТОВЫХ БЛОКОВ (пошагово: план → заполнение → эффекты → svg). Типовые лендинги",
        "create_page": "Создать ИЛИ отредактировать страницу свободным HTML+CSS. Креативные страницы и правки",
        "fill":        "Заполнить ВЫДЕЛЕННЫЙ элемент текстом / alt'ами / ссылками (НЕ картинками)",
        "effect":      "Визуальный эффект ИЛИ сгенерированная картинка/SVG для ВЫДЕЛЕННОГО элемента",
        "help":        "Вопрос про сам редактор NeuroCad",
        "none":        "Запрос не связан с редактором",
    }

    # Retry-like phrases. If the user message matches one of these
    # AND there is recent history, the LLM is asked to re-run the
    # previous action.
    _RETRY_RE = re.compile(
        r"\b(попробуй\s+(ещё|еще)\s+раз|"
        r"повтори|заново|"
        r"переделай|"
        r"ещё\s+раз|еще\s+раз|"
        r"давай\s+снова|"
        r"try\s+again|retry|redo)\b",
        re.IGNORECASE,
    )

    SYSTEM_PROMPT = """Ты — маршрутизатор запросов в редакторе страниц NeuroCad.

Твоя задача — выбрать ОДИН агент, который обработает запрос пользователя.

ДОСТУПНЫЕ АГЕНТЫ:
{agents}

СОСТОЯНИЕ РЕДАКТОРА:
{state}

ПОСЛЕДНИЕ СООБЩЕНИЯ В ЧАТЕ (свежие — внизу):
{history}

ПРАВИЛА:
1. Ответь ТОЛЬКО валидным JSON, без markdown и пояснений.
2. Формат: {{"agent": "<имя>", "target": "<selector | null>"}}
3. Поле "target" заполняй ТОЛЬКО для агентов fill и effect.
   Скопируй туда значение `selector` из состояния редактора дословно.
4. Если запрос не связан с редактором (анекдоты, погода, политика) —
   верни "none".
5. Если непонятно — верни "help".
6. RETRY: если пользователь просит повторить («попробуй ещё раз»,
   «повтори», «заново», «переделай») — посмотри на предыдущий запрос
   пользователя в истории и верни ТОТ ЖЕ агент, который был бы выбран
   для него. Не отправляй такой запрос в help.
7. Картинки: если пользователь просит НАРИСОВАТЬ / СГЕНЕРИРОВАТЬ /
   СДЕЛАТЬ картинку, SVG, иллюстрацию, «заменить плейсхолдер» —
   верни agent="effect", даже если в запросе есть слово «заполни».
8. Страница / лендинг / сайт — выбор между create и create_page:
   - "create"      — только если пользователь явно просит «из блоков»,
                     «по блокам», «собери из готовых»;
   - "create_page" — во всех остальных случаях: «сгенерируй страницу»,
                     «сделай лендинг», «создай сайт», креативные темы,
                     нестандартный дизайн. Также если страница уже есть
                     и пользователь просит её ИЗМЕНИТЬ целиком
                     («поменяй заголовок», «убери секцию», «добавь блок
                     с ценами»), но при этом НЕ выделен конкретный
                     элемент для точечной правки.
9. Правка выделенного элемента (fill / effect) имеет приоритет над
   правкой страницы: если есть выделение и пользователь просит
   изменить именно его — используй fill или effect.

ПРИМЕРЫ:
- "Сделай лендинг для салона" → {{"agent": "create_page", "target": null}}
- "Собери страницу из блоков" → {{"agent": "create", "target": null}}
- "Сгенерируй крутую страницу о Боге" → {{"agent": "create_page", "target": null}}
- "Сделай блог о путешествиях" → {{"agent": "create_page", "target": null}}
- "Поменяй заголовок в hero" (есть страница, нет выделения) → {{"agent": "create_page", "target": null}}
- "Убери секцию с отзывами" → {{"agent": "create_page", "target": null}}
- "Добавь блок с ценами после features" → {{"agent": "create_page", "target": null}}
- "Заполни выделенный блок" → {{"agent": "fill", "target": "sel-abc12345"}}
- "Сделай анимацию этому блоку" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Нарисуй картинку вместо плейсхолдера" → {{"agent": "effect", "target": "sel-abc12345"}}
- "Как сохранить пресет?" → {{"agent": "help", "target": null}}
- "Расскажи анекдот" → {{"agent": "none", "target": null}}

ПРИМЕР RETRY:
История:
  user: Собери лендинг для приюта кошек
  assistant: ⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз.
Текущий запрос: "Попробуй ещё раз"
Ответ: {{"agent": "create_page", "target": null}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""

    # ============================================
    # LOG HELPER
    # ============================================

    @staticmethod
    def _log(provider, level: str, message: str) -> None:
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
    # RETRY DETECTION
    # ============================================

    @classmethod
    def _is_retry(cls, user_message: str) -> bool:
        """True if the message is a retry-like phrase."""
        if not user_message:
            return False
        return bool(cls._RETRY_RE.search(user_message))

    # ============================================
    # STATE
    # ============================================

    @staticmethod
    def _build_state(
        selection: Optional[Dict[str, Any]],
        current_html: Optional[str],
    ) -> str:
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

        if current_html and current_html.strip():
            lines.append("- страница уже есть: да (её можно редактировать)")
        else:
            lines.append("- страница уже есть: нет (пустая)")

        return "\n".join(lines)

    # ============================================
    # HISTORY
    # ============================================

    @staticmethod
    def _build_history_block(
        history: Optional[List[Dict[str, str]]],
        max_turns: int = 4,
    ) -> str:
        """
        Render the last few user / assistant turns as a compact block.

        The router only needs enough context to understand a RETRY
        ("what was the user asking for before?") and to see whether
        the previous attempt succeeded or failed. Trim each message
        so the prompt stays small.
        """
        if not history:
            return "(пока ничего)"

        # Keep only the last N messages, in order.
        tail = history[-max_turns:]

        lines = []
        for m in tail:
            role = (m.get("role") or "").lower()
            content = (m.get("content") or "").strip()
            if not content:
                continue
            # Truncate each message so a long assistant reply does
            # not blow up the router prompt.
            if len(content) > 400:
                content = content[:400] + "…"
            if role == "user":
                lines.append(f"  user: {content}")
            elif role == "assistant":
                lines.append(f"  assistant: {content}")

        return "\n".join(lines) if lines else "(пока ничего)"

    # ============================================
    # ROUTE
    # ============================================

    @staticmethod
    async def route(
        provider,
        user_message: str,
        selection: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        run_id: Any = None,
        emit=None,
    ) -> Dict[str, Any]:
        """
        Ask the LLM which agent should handle the request.

        Returns {"agent": "<name>", "target": "<selector | null>"}.
        On any failure, falls back to {"agent": "help", "target": None}.

        `history` is the recent chat history (user / assistant).
        Used to resolve RETRY messages — the router sees what the
        user asked last and routes the retry to the same agent.

        `emit` is an optional async callback for progress frames.
        """
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
        state_block = CoreEngineLibWordLlmRouter._build_state(
            selection, current_html,
        )
        history_block = CoreEngineLibWordLlmRouter._build_history_block(history)

        system_prompt = CoreEngineLibWordLlmRouter.SYSTEM_PROMPT.format(
            agents=agents_block,
            state=state_block,
            history=history_block,
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
            CoreEngineLibWordLlmRouter._log(
                provider, "warning", f"dump request failed: {e}",
            )

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
            CoreEngineLibWordLlmRouter._log(
                provider, "warning", f"dump response failed: {e}",
            )

        # ---- parse ----
        data = CoreEngineLibWordLlmRouter._extract_json(raw)
        if not data:
            CoreEngineLibWordLlmRouter._log(
                provider, "warning", f"failed to parse response: {raw!r}",
            )
            # Rule-based fallback: if it's a retry, do not fall into help.
            if CoreEngineLibWordLlmRouter._is_retry(user_message):
                return {"agent": "create_page", "target": None}
            return {"agent": "help", "target": None}

        agent = str(data.get("agent", "help")).strip()
        target = data.get("target")
        if target is not None:
            target = str(target).strip() or None

        # ---- validate agent name ----
        if agent not in CoreEngineLibWordLlmRouter.AGENTS:
            CoreEngineLibWordLlmRouter._log(
                provider, "warning",
                f"unknown agent {agent!r}, falling back to help",
            )
            agent = "help"
            target = None

        # ---- sanity: fill/effect REQUIRE a selection ----
        # If the model routed to fill/effect but there is no
        # selection, the dispatcher would bounce the request anyway
        # ("выделите элемент"). Better to catch it here and route to
        # a page-level agent instead.
        if agent in ("fill", "effect"):
            has_selection = bool((selection or {}).get("selector"))
            if not has_selection:
                CoreEngineLibWordLlmRouter._log(
                    provider, "info",
                    f"agent={agent} but no selection — "
                    f"falling back to create_page",
                )
                agent = "create_page"
                target = None

        result = {"agent": agent, "target": target}
        CoreEngineLibWordLlmRouter._log(
            provider, "info", f"{user_message!r} -> {result}",
        )
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