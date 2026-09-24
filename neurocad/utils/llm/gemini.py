# neurocad/utils/llm/gemini.py

"""
Google Gemini provider.

Uses the Gemini API (v1beta, generateContent).
Messages are converted from OpenAI-style to Gemini format:
  - system  → systemInstruction
  - user    → {role: "user", parts: [...]}
  - assistant → {role: "model", parts: [...]}

Settings (all optional):
  GEMINI_API_KEY
  GEMINI_MODEL               (default: gemini-1.5-flash)
  GEMINI_MAX_OUTPUT_TOKENS   (default: 8192)
  GEMINI_TIMEOUT             (default: 120)
"""

import logging
import httpx
from typing import AsyncGenerator

from neurocad.config import settings
from .base import LLMProvider

logger = logging.getLogger(__name__)

DEFAULT_TEMPERATURE = 0.3


class GeminiProvider(LLMProvider):
    """Google Gemini client."""

    name = "gemini"

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self):
        self.api_key = getattr(settings, "GEMINI_API_KEY", None) or ""
        self.model = (
            getattr(settings, "GEMINI_MODEL", None) or "gemini-1.5-flash"
        )
        self.max_output_tokens = (
            getattr(settings, "GEMINI_MAX_OUTPUT_TOKENS", None) or 8192
        )
        self.timeout = getattr(settings, "GEMINI_TIMEOUT", None) or 120

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        if not self.is_configured:
            yield "Ошибка: Gemini API ключ не настроен. Добавьте GEMINI_API_KEY в .env"
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        # Convert OpenAI-style messages to Gemini format
        system_text = ""
        contents = []
        for m in messages_list:
            role = m.get("role")
            text = m.get("content", "")
            if role == "system":
                system_text = text
            elif role == "user":
                contents.append({"role": "user", "parts": [{"text": text}]})
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": text}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_text:
            payload["systemInstruction"] = {"parts": [{"text": system_text}]}

        url = (
            f"{self.BASE_URL}/models/{self.model}:generateContent"
            f"?key={self.api_key}"
        )
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error(
                        f"Gemini error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                    return

                result = response.json()
                candidates = result.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts") or []
                    text = "".join(p.get("text", "") for p in parts)
                    if text:
                        yield text

            except httpx.TimeoutException:
                logger.error("Gemini: timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                logger.error(f"Gemini: {e}")
                yield f"\n⚠️ Ошибка: {str(e)}\n"