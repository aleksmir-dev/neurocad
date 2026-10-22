# core/engine/lib/llm/agents/_04_personal/service.py

"""Orchestrator for the _04_personal agent."""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from .constants import (
    DEFAULT_EFFECTS_MODE,
    DEFAULT_JSON_RETRIES,
    DEFAULT_N_EFFECTS,
    VALID_EFFECTS_MODES,
    SECTION_NAMES,
)
from .css_ops import collect_css, strip_effects, upsert_effects
from .effects import sample_effects
from .html_ops import replace_section
from .prompt import CoreEngineLibLlmAgentsPersonalPrompt
from .schema import CoreEngineLibLlmAgentsPersonalRequest
from .state import PageState

logger = logging.getLogger(__name__)

DEBUG_DIR = os.path.join(os.path.dirname(__file__), "debug")


class CoreEngineLibLlmAgentsPersonalService:
    """Single entry point: brief / base / effects."""

    # ------------------------------------------------------------------ #
    # debug
    # ------------------------------------------------------------------ #
    @classmethod
    def _dump_debug(cls, stage: str, content: str) -> None:
        """Save raw LLM response to a file for analysis."""
        try:
            os.makedirs(DEBUG_DIR, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            path = os.path.join(DEBUG_DIR, f"{ts}_{stage}.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            logger.debug("[DEBUG] Raw response saved to: %s", path)
        except Exception as e:  # pragma: no cover
            logger.warning("[DEBUG] Failed to save raw response: %s", e)

    # ------------------------------------------------------------------ #
    # json helpers
    # ------------------------------------------------------------------ #
    @classmethod
    def _strip_markdown_fences(cls, content: str) -> str:
        """Remove ```json ... ``` fences around the payload."""
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return content.strip()

    @classmethod
    def _extract_json_object(cls, content: str) -> str:
        """Return the outermost {...} block; raise ValueError if none."""
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object found in response")
        return content[start:end + 1]

    @classmethod
    def _parse_json(cls, content: str) -> dict:
        """Strip fences, extract {...}, json.loads; raise ValueError on failure."""
        cleaned = cls._strip_markdown_fences(content)
        json_str = cls._extract_json_object(cleaned)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}")

    # ------------------------------------------------------------------ #
    # provider helpers
    # ------------------------------------------------------------------ #
    @classmethod
    def _check_finish_reason(cls, raw: Any) -> None:
        """Raise if the provider truncated the response by max_tokens."""
        reason = None
        if isinstance(raw, dict):
            reason = raw.get("finish_reason")
            if reason is None and isinstance(raw.get("choices"), list) and raw["choices"]:
                reason = raw["choices"][0].get("finish_reason")
        if reason == "length":
            raise ValueError(
                "LLM обрезала ответ по max_tokens. Увеличьте лимит "
                "или упростите запрос (меньше эффектов)."
            )

    @classmethod
    async def _chat(cls, provider: Any, messages: List[Dict[str, Any]]) -> str:
        """One model call; return cleaned text content."""
        raw = await provider.generate_completion(messages, max_tokens=8192)
        cls._check_finish_reason(raw)

        if isinstance(raw, str):
            content = raw.strip()
        elif isinstance(raw, dict):
            content = (raw.get("content") or "").strip()
        else:
            content = str(raw).strip()

        return cls._strip_markdown_fences(content)

    @classmethod
    async def _chat_json_with_retry(
        cls,
        provider: Any,
        messages: List[Dict[str, Any]],
        stage: str,
        retries: int = DEFAULT_JSON_RETRIES,
    ) -> dict:
        """Call LLM and parse JSON; retry up to `retries` times on failure."""
        last_content = await cls._chat(provider, messages)
        cls._dump_debug(stage, last_content)

        for attempt in range(1, retries + 1):
            try:
                return cls._parse_json(last_content)
            except ValueError as e:
                cls._dump_debug(f"{stage}_broken_json_attempt{attempt}", last_content)
                if attempt == retries:
                    raise ValueError(
                        f"LLM не вернула валидный JSON за {retries} попыток: {e}"
                    )
                messages = [
                    *messages,
                    {"role": "assistant", "content": last_content},
                    {
                        "role": "user",
                        "content": (
                            "Твой предыдущий ответ не является валидным JSON. "
                            "Верни ТОЛЬКО валидный JSON-объект, начни с { и "
                            "закончи }. Без markdown, без текста вне JSON."
                        ),
                    },
                ]
                last_content = await cls._chat(provider, messages)
                cls._dump_debug(f"{stage}_retry{attempt}", last_content)

        raise ValueError("Unreachable")  # pragma: no cover

    # ------------------------------------------------------------------ #
    # state helpers
    # ------------------------------------------------------------------ #
    @classmethod
    def _load_state(
        cls,
        request: CoreEngineLibLlmAgentsPersonalRequest,
    ) -> PageState:
        """Build PageState from request.state (fallback to fresh)."""
        if request.state:
            state = PageState.from_dict(request.state)
        else:
            state = PageState()
        state.ensure_sections()
        return state

    @classmethod
    def _request_messages(
        cls,
        state: PageState,
        system_prompt: str,
        user_content: str,
    ) -> List[Dict[str, Any]]:
        """Assemble system + history + user messages."""
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]
        for msg in state.history:
            role = msg.get("role")
            content = msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_content})
        return messages

    # ------------------------------------------------------------------ #
    # stages
    # ------------------------------------------------------------------ #
    @classmethod
    async def _stage_brief(
        cls,
        provider: Any,
        request: CoreEngineLibLlmAgentsPersonalRequest,
        state: PageState,
    ) -> Dict[str, Any]:
        """Dialog stage: ask one question at a time until ready."""
        system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_brief()
        messages = cls._request_messages(state, system_prompt, request.prompt)

        content = await cls._chat(provider, messages)
        cls._dump_debug("brief", content)

        try:
            data = cls._parse_json(content)
        except ValueError:
            logger.warning("Brief: JSON broken, fallback to text analysis.")
            question = content.strip() if "?" in content else None
            state.history.append({"role": "user", "content": request.prompt})
            state.history.append({"role": "assistant", "content": content})
            return {
                "question": question,
                "ready": False,
                "warning": "LLM вернула не-JSON." if not question else None,
                "state": state.to_dict(),
            }

        ready = bool(data.get("ready", False))
        color_hint = (data.get("color_hint") or "").strip() or None

        state.history.append({"role": "user", "content": request.prompt})
        state.history.append({"role": "assistant", "content": content})
        if ready and color_hint:
            state.color_hint = color_hint

        return {
            "question": data.get("question"),
            "ready": ready,
            "state": state.to_dict(),
        }

    @classmethod
    async def _stage_base(
        cls,
        provider: Any,
        request: CoreEngineLibLlmAgentsPersonalRequest,
        state: PageState,
    ) -> Dict[str, Any]:
        """Base stage: full layout HTML + per-section CSS."""
        system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_base(
            color_hint=state.color_hint,
        )
        messages = cls._request_messages(state, system_prompt, request.prompt)

        # Up to DEFAULT_JSON_RETRIES attempts: JSON must be valid AND
        # `css` must be an object (not a string).
        last_content = await cls._chat(provider, messages)
        cls._dump_debug("base", last_content)

        data: Optional[dict] = None
        for attempt in range(1, DEFAULT_JSON_RETRIES + 1):
            try:
                data = cls._parse_json(last_content)
            except ValueError as e:
                cls._dump_debug(f"base_broken_json_attempt{attempt}", last_content)
                if attempt == DEFAULT_JSON_RETRIES:
                    raise ValueError(
                        f"LLM не вернула валидный JSON за {DEFAULT_JSON_RETRIES} попыток: {e}"
                    )
                messages = cls._messages_for_css_object_retry(messages, last_content)
                last_content = await cls._chat(provider, messages)
                cls._dump_debug(f"base_retry{attempt}", last_content)
                continue

            css_field = data.get("css", {})
            if isinstance(css_field, dict):
                break

            if attempt == DEFAULT_JSON_RETRIES:
                raise ValueError(
                    f"LLM {DEFAULT_JSON_RETRIES} раз вернула 'css' не объектом "
                    f"(тип: {type(css_field).__name__}). Ожидается dict."
                )
            logger.warning(
                "base: 'css' is %s, asking model to reformat (attempt %d/%d).",
                type(css_field).__name__, attempt, DEFAULT_JSON_RETRIES,
            )
            messages = cls._messages_for_css_object_retry(messages, last_content)
            last_content = await cls._chat(provider, messages)
            cls._dump_debug(f"base_retry{attempt}", last_content)

        # Reached only with data and data["css"] is dict.
        css_by_section = {str(k): str(v) for k, v in (data.get("css") or {}).items() if v}
        html_parts = [
            (data.get("hero") or "").strip(),
            (data.get("projects") or "").strip(),
            (data.get("footer") or "").strip(),
        ]
        full_html = "\n".join(p for p in html_parts if p)
        if not full_html:
            raise ValueError("LLM вернула пустой макет")

        state.html = full_html
        state.css_by_section = {**state.css_by_section, **css_by_section}
        state.ensure_sections()

        return {
            "html": state.html,
            "css": collect_css(state.css_by_section),
            "css_by_section": dict(state.css_by_section),
            "state": state.to_dict(),
        }

    @classmethod
    async def _stage_effects(
        cls,
        provider: Any,
        request: CoreEngineLibLlmAgentsPersonalRequest,
        state: PageState,
    ) -> Dict[str, Any]:
        """Effects stage: update exactly one section."""
        target = request.target_section
        if not target:
            raise ValueError("target_section обязателен для stage='effects'")
        if target not in SECTION_NAMES:
            raise ValueError(f"Неизвестная секция: {target}")

        mode = request.effects_mode or DEFAULT_EFFECTS_MODE
        if mode not in VALID_EFFECTS_MODES:
            raise ValueError(f"Неверный effects_mode: {mode}")

        n_effects = request.n_effects if request.n_effects is not None else DEFAULT_N_EFFECTS
        picked = sample_effects(n=n_effects, seed=request.seed)

        # Model sees only the BASE CSS of the section — no old effects.
        base_css = strip_effects(state.css_by_section.get(target, ""))

        system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_effects(
            target_section=target,
            current_html=state.html,
            base_css=base_css,
            color_hint=state.color_hint,
            effects=picked,
            seed=request.seed,
        )
        user_content = (
            f"Задача: {request.prompt or 'Добавь эффекты'}\n"
            f"Верни обновлённый HTML секции «{target}» и только новые CSS-правила для неё."
        )
        messages = cls._request_messages(state, system_prompt, user_content)

        data = await cls._chat_json_with_retry(provider, messages, stage="effects")

        new_section_html = (data.get("html") or "").strip()
        new_section_css = data.get("css") or ""

        if not new_section_html:
            raise ValueError("LLM вернула пустой HTML для секции")
        if not isinstance(new_section_css, str):
            raise ValueError(
                f"LLM вернула 'css' не строкой (тип: {type(new_section_css).__name__})"
            )

        # Apply: HTML replace + CSS upsert. Both inside the agent.
        state.html = replace_section(state.html, target, new_section_html)
        state.css_by_section[target] = upsert_effects(
            state.css_by_section.get(target, ""),
            target,
            new_section_css,
            mode=mode,
        )

        return {
            "html": new_section_html,
            "css": collect_css(state.css_by_section),
            "css_by_section": dict(state.css_by_section),
            "section": target,
            "state": state.to_dict(),
        }

    @classmethod
    def _messages_for_css_object_retry(
        cls,
        messages: List[Dict[str, Any]],
        broken_content: str,
    ) -> List[Dict[str, Any]]:
        """Append a reformat request when `css` came back as a string."""
        return [
            *messages,
            {"role": "assistant", "content": broken_content},
            {
                "role": "user",
                "content": (
                    "Твой предыдущий ответ не соответствует формату: поле "
                    "'css' должно быть объектом с ключами 'hero', 'projects', "
                    "'footer', где каждое значение — строка CSS только для "
                    "этой секции. Верни ТОЛЬКО валидный JSON, где 'css' — "
                    "объект {hero, projects, footer}. Содержимое CSS не меняй."
                ),
            },
        ]

    # ------------------------------------------------------------------ #
    # main
    # ------------------------------------------------------------------ #
    @classmethod
    async def generate(
        cls,
        *,
        provider: Any,
        request: CoreEngineLibLlmAgentsPersonalRequest,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """
        Dispatch by request.stage. Returns a plain dict for the route.

        Raises:
            ValueError — unknown stage, bad section, bad mode, LLM format.
            Exception  — provider / network errors (route maps to 500).
        """
        state = cls._load_state(request)

        if request.stage == "brief":
            return await cls._stage_brief(provider, request, state)
        if request.stage == "base":
            return await cls._stage_base(provider, request, state)
        if request.stage == "effects":
            return await cls._stage_effects(provider, request, state)

        raise ValueError(f"Неизвестный stage: {request.stage}")