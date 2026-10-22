# core/engine/lib/llm/agents/_04_personal/service.py

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional, List

from .prompt import CoreEngineLibLlmAgentsPersonalPrompt

logger = logging.getLogger(__name__)

DEBUG_DIR = os.path.join(os.path.dirname(__file__), "debug")

MAX_CSS_RETRIES = 3


class CoreEngineLibLlmAgentsPersonalService:

    # ------------------------------------------------------------------ #
    # debug
    # ------------------------------------------------------------------ #
    @classmethod
    def _dump_debug(cls, stage: str, content: str) -> None:
        """Сохраняет сырой ответ LLM в файл для анализа."""
        try:
            os.makedirs(DEBUG_DIR, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = os.path.join(DEBUG_DIR, f"{timestamp}_{stage}.txt")
            with open(filename, "w", encoding="utf-8") as f:
                f.write(content)
            logger.debug("[DEBUG] Raw response saved to: %s", filename)
        except Exception as e:  # pragma: no cover
            logger.warning("[DEBUG] Failed to save raw response: %s", e)

    # ------------------------------------------------------------------ #
    # helpers
    # ------------------------------------------------------------------ #
    @classmethod
    def _strip_markdown_fences(cls, content: str) -> str:
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
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object found in response")
        return content[start:end + 1]

    @classmethod
    def _check_finish_reason(cls, raw: Any) -> None:
        """Если провайдер вернул finish_reason == 'length' — бросаем ошибку."""
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
    def _call_provider(
        cls, provider: Any, messages: List[Dict[str, Any]]
    ) -> str:
        """Синхронный вызов вынесен в async-метод ниже, здесь только тип."""
        raise NotImplementedError  # pragma: no cover

    @classmethod
    async def _chat(cls, provider: Any, messages: List[Dict[str, Any]]) -> str:
        """Один вызов модели. Возвращает очищенный текст ответа."""
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
    def _messages_for_base_retry(
        cls,
        messages: List[Dict[str, Any]],
        broken_content: str,
    ) -> List[Dict[str, Any]]:
        """
        Готовит сообщения для ретрая: добавляет ответ модели и просьбу
        переформатировать 'css' в объект по секциям. Никакого парсинга.
        """
        return [
            *messages,
            {"role": "assistant", "content": broken_content},
            {
                "role": "user",
                "content": (
                    "Твой предыдущий ответ не соответствует формату: поле "
                    "'css' должно быть объектом с ключами 'hero', 'projects', "
                    "'footer', где каждое значение — строка CSS только для "
                    "этой секции. Ты вернул 'css' строкой (или невалидный "
                    "JSON). Переформатируй ответ: верни ТОЛЬКО валидный JSON, "
                    "где 'css' — объект {hero, projects, footer}. Содержимое "
                    "CSS не меняй, только разложи по ключам. Без markdown, "
                    "без текста вне JSON."
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
        user_message: str,
        stage: str = "base",
        target_section: Optional[str] = None,
        current_html: Optional[str] = None,
        current_css: Optional[str] = None,
        css_by_section: Optional[Dict[str, str]] = None,
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:

        # 1. Промпт и user_content
        if stage == "brief":
            system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_brief()
            user_content = user_message

        elif stage == "effects":
            if not target_section:
                return {"error": "target_section is required for stage='effects'"}

            section_css = ""
            if css_by_section and target_section in css_by_section:
                section_css = css_by_section[target_section] or ""
            elif current_css:
                section_css = current_css

            system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_effects(
                target_section=target_section,
                current_html=current_html or "",
                current_css=section_css,
            )
            user_content = (
                f"Задача: {user_message}\n"
                f"Верни обновлённый HTML секции «{target_section}» и только новые "
                f"CSS-правила для неё."
            )

        else:  # base
            system_prompt = CoreEngineLibLlmAgentsPersonalPrompt.build_base()
            user_content = user_message

        # 2. messages
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ]
        if history:
            for msg in history:
                role = msg.get("role")
                content = msg.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_content})

        # 3. вызов
        try:
            content = await cls._chat(provider, messages)
            cls._dump_debug(stage, content)

            # --- brief ---
            if stage == "brief":
                try:
                    json_str = cls._extract_json_object(content)
                    data = json.loads(json_str)
                    return {
                        "question": data.get("question"),
                        "ready": bool(data.get("ready", False)),
                    }
                except (ValueError, json.JSONDecodeError):
                    logger.warning("Brief: JSON broken, fallback to text analysis.")
                    if "?" in content:
                        return {"question": content.strip(), "ready": False}
                    # Не ставим ready=True автоматически — это преждевременно
                    # завершало брифинг. Клиент решит, что делать.
                    return {
                        "question": None,
                        "ready": False,
                        "warning": "LLM вернула не-JSON и без вопроса.",
                    }

            # --- base / effects ---
            if stage == "base":
                # Для base требуем, чтобы 'css' был dict. Если строка —
                # просим модель переформатировать. До MAX_CSS_RETRIES попыток.
                attempt_messages = messages
                last_content = content

                for attempt in range(1, MAX_CSS_RETRIES + 1):
                    try:
                        json_str = cls._extract_json_object(last_content)
                        data = json.loads(json_str)
                    except (ValueError, json.JSONDecodeError) as e:
                        cls._dump_debug(f"base_BROKEN_JSON_attempt{attempt}", last_content)
                        if attempt == MAX_CSS_RETRIES:
                            raise ValueError(
                                f"LLM не вернула валидный JSON за {MAX_CSS_RETRIES} попыток: {e}"
                            )
                        attempt_messages = cls._messages_for_base_retry(
                            attempt_messages, last_content
                        )
                        last_content = await cls._chat(provider, attempt_messages)
                        cls._dump_debug(f"base_retry{attempt}", last_content)
                        continue

                    css_field = data.get("css", {})

                    # Если css — dict, всё хорошо
                    if isinstance(css_field, dict):
                        break

                    # Если css — строка (или что-то ещё) — просим модель
                    # переформатировать. Никаких парсеров.
                    if attempt == MAX_CSS_RETRIES:
                        raise ValueError(
                            f"LLM {MAX_CSS_RETRIES} раз вернула 'css' не объектом "
                            f"(тип: {type(css_field).__name__}). "
                            f"Ожидается dict {{hero, projects, footer}}."
                        )
                    logger.warning(
                        "base: 'css' пришёл как %s, просим модель переформатировать "
                        "(попытка %d/%d).",
                        type(css_field).__name__, attempt, MAX_CSS_RETRIES,
                    )
                    attempt_messages = cls._messages_for_base_retry(
                        attempt_messages, last_content
                    )
                    last_content = await cls._chat(provider, attempt_messages)
                    cls._dump_debug(f"base_retry{attempt}", last_content)

                # Сюда попадаем только если css_field — dict
                css_by_section = {
                    str(k): str(v) for k, v in css_field.items() if v
                }

                hero_html = data.get("hero", "") or ""
                projects_html = data.get("projects", "") or ""
                footer_html = data.get("footer", "") or ""
                full_html = "\n".join(
                    x for x in (hero_html, projects_html, footer_html) if x.strip()
                )
                if not full_html.strip():
                    raise ValueError("LLM returned empty layout")

                return {
                    "html": full_html,
                    "css": "\n".join(v for v in css_by_section.values() if v),
                    "css_by_section": css_by_section,
                }

            # --- effects ---
            if stage == "effects" and target_section:
                json_str = cls._extract_json_object(content)
                try:
                    data = json.loads(json_str)
                except json.JSONDecodeError as e:
                    cls._dump_debug(f"effects_BROKEN_JSON", json_str)
                    raise ValueError(f"Invalid JSON: {e}")

                new_section_html = data.get("html", "") or ""
                new_section_css = data.get("css", "") or ""

                if not new_section_html.strip():
                    raise ValueError("LLM returned empty HTML for section")
                if not isinstance(new_section_css, str):
                    raise ValueError(
                        "LLM returned non-string CSS for effects "
                        f"(type: {type(new_section_css).__name__})"
                    )

                return {
                    "html": new_section_html,
                    "css": new_section_css,
                    "section": target_section,
                }

            return {"error": f"Unknown stage: {stage}"}

        except Exception as e:
            logger.error("Generation failed: %s", e)
            return {"error": str(e)}