# neurocad/utils/llm/yandex.py

"""
YandexGPT provider.

Uses the Yandex Cloud Foundation Models API:
  https://llm.api.cloud.yandex.net/foundationModels/v1/completion

Settings (all optional):
  YANDEX_API_KEY             — IAM or API key
  YANDEX_FOLDER_ID           — Yandex Cloud folder id
  YANDEX_MODEL               (default: yandexgpt-lite)
  YANDEX_MAX_OUTPUT_TOKENS   (default: 4096)
  YANDEX_TIMEOUT             (default: 120)

Streaming is not implemented — the API is called in non-streaming mode.
"""

import logging
import httpx
from typing import AsyncGenerator

from neurocad.config import settings
from .base import LLMProvider

logger = logging.getLogger(__name__)

DEFAULT_TEMPERATURE = 0.3


class YandexProvider(LLMProvider):
    """YandexGPT client."""

    name = "yandex"

    API_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

    def __init__(self):
        self.api_key = getattr(settings, "YANDEX_API_KEY", None) or ""
        self.folder_id = getattr(settings, "YANDEX_FOLDER_ID", None) or ""
        self.model = getattr(settings, "YANDEX_MODEL", None) or "yandexgpt-lite"
        self.max_output_tokens = (
            getattr(settings, "YANDEX_MAX_OUTPUT_TOKENS", None) or 4096
        )
        self.timeout = getattr(settings, "YANDEX_TIMEOUT", None) or 120

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.folder_id)

    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        if not self.is_configured:
            yield (
                "Ошибка: YandexGPT не настроен. "
                "Нужны YANDEX_API_KEY и YANDEX_FOLDER_ID в .env"
            )
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        # Split system message from the rest
        system_text = ""
        chat_messages = []
        for m in messages_list:
            role = m.get("role")
            text = m.get("content", "")
            if role == "system":
                system_text = text
            else:
                chat_messages.append({"role": role, "text": text})

        if system_text:
            chat_messages.insert(0, {"role": "system", "text": system_text})

        payload = {
            "modelUri": f"gpt://{self.folder_id}/{self.model}",
            "completionOptions": {
                "stream": False,
                "temperature": temperature,
                "maxTokens": str(max_tokens),
            },
            "messages": chat_messages,
        }
        headers = {
            "Authorization": f"Api-Key {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(self.API_URL, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error(
                        f"YandexGPT error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                    return

                result = response.json()
                alternatives = result.get("result", {}).get("alternatives") or []
                if alternatives:
                    text = alternatives[0].get("message", {}).get("text", "")
                    if text:
                        yield text

            except httpx.TimeoutException:
                logger.error("YandexGPT: timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                logger.error(f"YandexGPT: {e}")
                yield f"\n⚠️ Ошибка: {str(e)}\n"