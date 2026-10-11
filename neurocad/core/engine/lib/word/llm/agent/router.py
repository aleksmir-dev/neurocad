# neurocad/core/engine/lib/word/llm/agent/router.py

"""
Router — decides which agent handles the request, or asks a
clarifying question first.

The router is the "administrator" agent. It always meets the user's
message first. It never does the work itself — it either:

  1. Asks a clarifying question, saving the user from a wrong
     agent run (which would cost minutes and tokens), or
  2. Picks an agent and hands the task over.

How the router decides
----------------------
It looks at the recent chat history and checks the LAST assistant
message:

  - If that message has `is_quest == 1`, it was a clarifying
    question from a previous router turn. The current user message
    is therefore a REPLY to that question — the router now has
    enough context to pick an agent.

  - Otherwise, the current user message is a NEW request. The
    router must ask a clarifying question first.

History window
--------------
For the "reply" case, the router collects the WHOLE dialog of
clarifications — from the last non-question message (the original
user request) to the current reply. Not just the last question and
answer. This lets the model see the full context if the user
answered several questions in a row.

LLM decides
-----------
All text handling is delegated to the LLM:

  - The router always emits "Определяю действие..." before
    calling the model, so the user sees that work is happening.

  - If the LLM is not sure whether the user's message is a reply
    or a new request, it can say so, and the router falls back to
    asking a fresh question.

  - There is no regex-based retry detection anymore. "Попробуй
    ещё раз" is handled as an ordinary message — either as a
    reply (if it follows a question) or as a new request (in
    which case the router asks its own clarifying question).

Response shape
--------------
    # Router picked an agent — dispatch should run it.
    {"agent": "create_page", "question": None}

    # Router wants to ask first — dispatch should save the
    # question with is_quest=1 and send it to the user.
    {"agent": None, "question": "Уточните, пожалуйста — ..."}

Namespace: CoreEngineLibWordLlmRouter
"""

import json
from typing import Any, Dict, List, Optional


# ============================================
# AGENTS
# ============================================

#: Agents the router is allowed to choose.
#:
#: Currently enabled:
#:   create_page — create OR edit a page with free-form HTML+CSS.
#:   none        — the request is not about the editor.
#:
#: TEMPORARILY DISABLED — help:
#:   The `help` agent (NeuroCad FAQ) is a working agent in
#:   agent/help.py, but it is not listed here. Reason: the router
#:   could not reliably tell "help" (a question about the editor)
#:   from "create_page" (a task for the editor) on short messages
#:   like "Как поменять цвет?" — and picking wrong wasted tokens
#:   and confused the user. Plan: move `help` to its own chat
#:   (separate WS mode), where it will not need the router at all.
#:   Until then, questions about the editor fall through to
#:   `none` (which politely declines). The agent file itself is
#:   unchanged and can be re-enabled by adding it back here.
#:
#: Temporarily DISABLED (files exist, but not listed here — the
#: router's validation drops any name it does not know):
#:   help          — NeuroCad FAQ (see above).
#:   create        — build a page from ready blocks.
#:   fill          — fill the selected element with text.
#:   effect        — visual effects / generated SVG.
#:   edit          — edit the CSS of an existing effect.
#:   rename        — propose a new label/media for an effect.
#:   create_effect — build a draft of a new effect.
#:   template_uni  — build a universal base template.
#:   template_art  — build a base template for articles.
#:   article       — generate the text of an article.
#:
#: To re-enable one, add it back here AND mention it in the
#: ask/pick prompts below. The agent module itself does not change.
AGENTS: Dict[str, str] = {
    "create_page": (
        "Создать ИЛИ отредактировать страницу свободным HTML+CSS. "
        "Креативные страницы, лендинги, нестандартная вёрстка, "
        "правки существующей страницы."
    ),
    "none": (
        "Запрос не связан с редактором: анекдоты, погода, "
        "политика, математика, посторонние разговоры. "
        "Сюда же временно попадают вопросы про сам редактор "
        "(«как сохранить пресет», «как поменять цвет») — "
        "агент help пока отключён, см. комментарий выше."
    ),
}


# ============================================
# PROMPTS
# ============================================

#: Prompt B — the router ASKS a clarifying question.
#:
#: Used when the current user message is a NEW request. The model
#: must NOT pick an agent yet — it must ask one short question
#: that will let it choose on the next turn.
#:
#: The question must be in Russian, friendly, and end with "?".
#: If the request is clearly off-topic (joke, weather, politics),
#: the model still asks — but asks a "did you mean anything for
#: the editor?" style question, so a mistaken classification can
#: be corrected by the user.
SYSTEM_PROMPT_ASK = """Ты — администратор в NeuroCad. Твоя задача — не делать работу самому, а передавать её агентам-специалистам.

Пользователь только что написал запрос. Ты пока НЕ знаешь, какой агент ему нужен. Поэтому ты задаёшь ОДИН короткий уточняющий вопрос.

ДОСТУПНЫЕ АГЕНТЫ:
{agents}

СОСТОЯНИЕ РЕДАКТОРА:
{state}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
{user_message}

ПРАВИЛА:
1. Задай ОДИН короткий вопрос на русском, заканчивается на "?".
2. Вопрос должен помочь тебе выбрать ОДНОГО агента из списка.
3. Вопрос должен быть дружелюбным и понятным не-программисту.
4. Если запрос явно не по теме (анекдот, погода, политика) — всё равно задай вопрос в стиле "Уточните, пожалуйста: это что-то для редактора или просто разговор?". Не отказывай сразу — дай пользователю шанс объяснить.
5. Если запрос двусмысленный ("сделай страницу") — предложи 2-3 варианта в тексте вопроса: "Уточните, пожалуйста — вам нужна готовая страница или базовый шаблон?"
6. НЕ ВЫБИРАЙ агента сейчас. Только вопрос.
7. НЕ пиши пояснений. Только вопрос.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{"question": "<твой вопрос>"}}

ПРИМЕРЫ:
- Запрос: "Собери лендинг для кофейни" → {{"question": "Уточните, пожалуйста — вам нужна готовая страница для кофейни или базовый шаблон?"}}
- Запрос: "Расскажи анекдот" → {{"question": "Уточните, пожалуйста — это что-то для редактора или просто разговор?"}}
- Запрос: "Как сохранить пресет?" → {{"question": "Уточните, пожалуйста — вы хотите что-то сделать со страницей или это просто вопрос?"}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""

#: Prompt A — the router PICKS an agent.
#:
#: Used when the current user message is a REPLY to a previous
#: clarifying question. The model sees the full dialog of
#: clarifications (original request + all question/answer pairs)
#: and must pick exactly one agent.
SYSTEM_PROMPT_PICK = """Ты — администратор в NeuroCad. Ты уже задавал пользователю уточняющие вопросы. Теперь у тебя достаточно информации, чтобы выбрать агента.

ДОСТУПНЫЕ АГЕНТЫ:
{agents}

СОСТОЯНИЕ РЕДАКТОРА:
{state}

ДИАЛОГ УТОЧНЕНИЙ (сначала — исходный запрос, потом твои вопросы и ответы пользователя):

{dialog}

ПОСЛЕДНЕЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:
{user_message}

ПРАВИЛА:
1. Выбери РОВНО ОДНОГО агента из списка. Не двух, не "может быть".
2. Если пользователь по ходу диалога СМЕНИЛ ТЕМУ (например, начал про страницу, а теперь просит анекдот) — верни особое поле "new_request": true. Тогда система начнёт уточнение заново.
3. Ориентируйся на ИСХОДНЫЙ запрос и на то, что пользователь уточнил. Не теряй контекст.
4. Если пользователь ответил уклончиво ("не знаю", "как хочешь") — выбери наиболее вероятного агента по исходному запросу.
5. Не пиши пояснений. Только JSON.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{"agent": "<имя>", "new_request": false}}

ПРИМЕРЫ:
- Диалог: "Собери лендинг для кофейни" → "Готовая или шаблон?" → "Готовая" → {{"agent": "create_page", "new_request": false}}
- Диалог: "Как сохранить пресет?" → "Это про редактор?" → "Да" → {{"agent": "none", "new_request": false}}
- Диалог: "Собери лендинг" → "Готовая или шаблон?" → "Забудь, расскажи анекдот" → {{"agent": "none", "new_request": true}}
- Диалог: "Расскажи анекдот" → "Это для редактора?" → "Просто разговор" → {{"agent": "none", "new_request": false}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


# ============================================
# ROUTER
# ============================================

class CoreEngineLibWordLlmRouter:
    """Pick the right agent for a user request, or ask first."""

    # ============================================
    # STATE
    # ============================================

    @staticmethod
    def _build_state(
        selection: Optional[Dict[str, Any]],
        current_html: Optional[str],
    ) -> str:
        """Render the editor state block for both prompts."""
        lines = []

        if selection and selection.get("selector"):
            tag = selection.get("tag") or "?"
            classes = selection.get("classes") or []
            cls = ", ".join(str(c) for c in classes) if classes else "—"
            lines.append(f"- выделен элемент: <{tag}> с классами: {cls}")
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
    # DIALOG EXTRACTION
    # ============================================

    @staticmethod
    def _extract_dialog(
        history: Optional[List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        """
        Extract the current clarification dialog from history.

        The dialog starts at the last user message that is NOT a
        reply to a previous question. Concretely: walk the history
        backwards, find the LAST assistant message with
        is_quest=0 (or the very beginning), and take everything
        from the user message right after it, up to the end.

        If no assistant-with-is_quest=0 is found, take from the
        beginning. Returns an empty list if there is no history.
        """
        if not history:
            return []

        # Walk backwards: find the last message that "resets" the
        # dialog — an assistant message with is_quest=0.
        start_idx = 0
        for i in range(len(history) - 1, -1, -1):
            m = history[i]
            if m.get("role") == "assistant" and not m.get("is_quest"):
                # Dialog starts right AFTER this message.
                start_idx = i + 1
                break
        else:
            # No assistant with is_quest=0 — start from the beginning.
            start_idx = 0

        return history[start_idx:]

    @staticmethod
    def _is_last_assistant_question(
        history: Optional[List[Dict[str, Any]]],
    ) -> bool:
        """
        True if the last assistant message in history is a
        clarifying question (is_quest=1).

        This is the primary, deterministic check. If it returns
        True, the current user message is treated as a REPLY.
        """
        if not history:
            return False
        for m in reversed(history):
            if m.get("role") == "assistant":
                return bool(m.get("is_quest"))
            if m.get("role") == "user":
                # A user message after the last assistant — the
                # assistant is not the last one. Not our case.
                continue
        return False

    # ============================================
    # DIALOG FORMATTING
    # ============================================

    @staticmethod
    def _format_dialog(dialog: List[Dict[str, Any]]) -> str:
        """
        Format the extracted dialog for the PICK prompt.

        Each line: "  <role>: <content>", with is_quest=1
        assistant messages marked as questions.
        """
        if not dialog:
            return "(диалога нет)"

        lines: List[str] = []
        for m in dialog:
            role = m.get("role") or "?"
            content = (m.get("content") or "").strip()
            if not content:
                continue
            # Truncate long assistant messages so the prompt
            # does not blow up on verbose agent replies.
            if len(content) > 500:
                content = content[:500] + "…"
            if role == "user":
                lines.append(f"  user: {content}")
            elif role == "assistant":
                marker = " [вопрос]" if m.get("is_quest") else ""
                lines.append(f"  assistant{marker}: {content}")

        return "\n".join(lines) if lines else "(диалога нет)"

    # ============================================
    # JSON PARSING
    # ============================================

    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        """
        Tolerant JSON extraction.

        Strips markdown fences, tries the whole string, then the
        first {...} block. Returns None on any failure.
        """
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

    # ============================================
    # LOG
    # ============================================

    @staticmethod
    def _log(provider, level: str, message: str) -> None:
        """Best-effort logging through the provider's logger."""
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
    # ROUTE
    # ============================================

    @staticmethod
    async def route(
        provider,
        user_message: str,
        selection: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        history: Optional[List[Dict[str, Any]]] = None,
        run_id: Any = None,
        emit=None,
    ) -> Dict[str, Any]:
        """
        Decide what to do with the user's message.

        Returns one of:

            {"agent": "<name>", "question": None}
                — the router picked an agent; dispatch should
                  run it.

            {"agent": None, "question": "<text>"}
                — the router wants to ask a clarifying question
                  first; dispatch should save it with is_quest=1
                  and send it to the user.

            {"agent": None, "question": None}
                — the router could not decide at all (LLM error).
                  Dispatch should fall back to none.
        """
        history = history or []

        # ---- progress ----
        if emit:
            await emit({
                "type": "step",
                "step": "routing",
                "message": "Определяю действие...",
            })

        # ---- state block (same for both prompts) ----
        agents_block = "\n".join(
            f"- {name}: {desc}" for name, desc in AGENTS.items()
        )
        state_block = CoreEngineLibWordLlmRouter._build_state(
            selection, current_html,
        )

        # ---- determine: reply or new request? ----
        is_reply = CoreEngineLibWordLlmRouter._is_last_assistant_question(history)

        # ---- pick prompt ----
        if is_reply:
            dialog = CoreEngineLibWordLlmRouter._extract_dialog(history)
            dialog_block = CoreEngineLibWordLlmRouter._format_dialog(dialog)
            system_prompt = SYSTEM_PROMPT_PICK.format(
                agents=agents_block,
                state=state_block,
                dialog=dialog_block,
                user_message=user_message,
            )
            mode = "pick"
        else:
            system_prompt = SYSTEM_PROMPT_ASK.format(
                agents=agents_block,
                state=state_block,
                user_message=user_message,
            )
            mode = "ask"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        # ---- dump request ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name=f"router_{mode}",
                system_prompt=system_prompt,
                user_content=user_message,
            )
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(
                provider, "warning", f"dump request failed: {e}",
            )

        # ---- call LLM ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(provider, "error", f"LLM error: {e}")
            return {"agent": None, "question": None}

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name=f"router_{mode}",
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
            return {"agent": None, "question": None}

        # ============================================
        # REPLY MODE — pick an agent
        # ============================================
        if is_reply:
            # The model may say the user switched topics — then
            # we discard the current dialog and ask a fresh
            # question. The router restarts the clarification.
            if data.get("new_request"):
                CoreEngineLibWordLlmRouter._log(
                    provider, "info",
                    "router: user changed topic — restarting dialog",
                )
                # Ask a fresh question (ask prompt).
                return await CoreEngineLibWordLlmRouter._ask(
                    provider=provider,
                    user_message=user_message,
                    agents_block=agents_block,
                    state_block=state_block,
                    run_id=run_id,
                    emit=emit,
                )

            agent = str(data.get("agent", "")).strip()

            if agent not in AGENTS:
                CoreEngineLibWordLlmRouter._log(
                    provider, "warning",
                    f"unknown agent {agent!r}, falling back to none",
                )
                agent = "none"

            result = {"agent": agent, "question": None}
            CoreEngineLibWordLlmRouter._log(
                provider, "info", f"pick: {user_message!r} -> {result}",
            )
            return result

        # ============================================
        # ASK MODE — return the question
        # ============================================
        question = str(data.get("question", "")).strip()
        if not question:
            CoreEngineLibWordLlmRouter._log(
                provider, "warning",
                f"router returned no question: {data!r}",
            )
            return {"agent": None, "question": None}

        CoreEngineLibWordLlmRouter._log(
            provider, "info", f"ask: {user_message!r} -> {question!r}",
        )
        return {"agent": None, "question": question}

    # ============================================
    # INTERNAL — ASK
    # ============================================

    @staticmethod
    async def _ask(
        provider,
        user_message: str,
        agents_block: str,
        state_block: str,
        run_id: Any,
        emit,
    ) -> Dict[str, Any]:
        """
        Ask a fresh clarifying question.

        Used both on the first turn and when the user switches
        topics mid-dialog (new_request=true in the pick prompt).
        """
        system_prompt = SYSTEM_PROMPT_ASK.format(
            agents=agents_block,
            state=state_block,
            user_message=user_message,
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            CoreEngineLibWordLlmRouter._log(
                provider, "error", f"LLM error in _ask: {e}",
            )
            return {"agent": None, "question": None}

        data = CoreEngineLibWordLlmRouter._extract_json(raw)
        if not data:
            return {"agent": None, "question": None}

        question = str(data.get("question", "")).strip()
        if not question:
            return {"agent": None, "question": None}

        return {"agent": None, "question": question}