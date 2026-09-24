# neurocad/utils/llm/deepseek.py

"""
DeepSeek provider (OpenAI-compatible API).

Implements the common `LLMProvider` interface. All parameters are read
from `settings` (config.py). Supports streaming and non-streaming modes.
"""

import json
import logging
import httpx
import tiktoken
from typing import AsyncGenerator

from neurocad.config import settings
from .base import LLMProvider

logger = logging.getLogger(__name__)


# ============================================
# CONSTANTS
# ============================================

#: Default temperature. Not exposed in .env — fixed value.
DEFAULT_TEMPERATURE = 0.3

#: Max context tokens (used by truncate_to_context_limit).
#: DeepSeek V4.1-Flash supports up to 1M tokens of context.
MAX_CONTEXT_TOKENS = 1_000_000


# ============================================
# TOKENIZER
# ============================================

def get_deepseek_tokenizer():
    """
    Tokenizer for DeepSeek.

    tiktoken does not ship DeepSeek-specific encodings. DeepSeek V4/V4.1
    use cl100k_base-compatible tokenization, so use it directly.

    Returns None if cl100k_base is unavailable — callers must fall
    back to a rough estimate.
    """
    try:
        return tiktoken.get_encoding("cl100k_base")
    except Exception as e:
        logger.warning(f"cl100k_base недоступен: {e}")
        return None


def count_tokens(text: str) -> int:
    """
    Count tokens in a string.

    Uses cl100k_base when available. Falls back to a rough estimate
    (~0.6 tokens per character, averaged between Latin and Cyrillic)
    if the tokenizer is unavailable or fails.
    """
    if not text:
        return 0

    tokenizer = get_deepseek_tokenizer()
    if tokenizer is None:
        return int(len(text) * 0.6)

    try:
        return len(tokenizer.encode(text))
    except Exception as e:
        logger.error(f"Ошибка при подсчёте токенов: {e}")
        return int(len(text) * 0.6)


def truncate_to_context_limit(
    messages_list: list,
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> list:
    """
    Truncate the message history to fit the context window.

    Keeps the newest messages, drops the oldest ones. The system
    message (messages_list[0] if role == 'system') is always kept.

    Reserves settings.DEEPSEEK_MAX_OUTPUT_TOKENS tokens for the
    response — so the input never fills the entire context window.
    """
    total_tokens = 0
    truncated = []

    for msg in reversed(messages_list):
        content = msg.get('content', '')
        msg_tokens = count_tokens(content) + 4

        if total_tokens + msg_tokens > max_tokens - settings.DEEPSEEK_MAX_OUTPUT_TOKENS:
            break

        truncated.insert(0, msg)
        total_tokens += msg_tokens

    if messages_list and messages_list[0].get('role') == 'system':
        if not truncated or truncated[0].get('role') != 'system':
            truncated.insert(0, messages_list[0])

    logger.info(
        f"Контекст обрезан: {len(messages_list)} -> {len(truncated)} "
        f"сообщений, {total_tokens} токенов"
    )
    return truncated


# ============================================
# PROVIDER CLASS
# ============================================

class DeepSeekProvider(LLMProvider):
    """
    DeepSeek API client (OpenAI-compatible).

    Reads all configuration from `settings` — API key, base URL, model
    name, max output tokens, request timeout. Temperature is fixed
    (DEFAULT_TEMPERATURE) and not exposed in .env.
    """

    name = "deepseek"

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
        self.model = settings.DEEPSEEK_MODEL
        self.max_output_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS
        self.timeout = settings.DEEPSEEK_TIMEOUT

    @property
    def is_configured(self) -> bool:
        """DeepSeek is ready when an API key is present."""
        return bool(self.api_key)

    def _build_api_url(self) -> str:
        """Build the full URL for chat/completions from base_url."""
        return f"{self.base_url}/chat/completions"

    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        Async request to the DeepSeek API.

        stream=False — one chunk with the whole response.
        stream=True  — chunks as they arrive.
        """
        if not self.is_configured:
            yield "Ошибка: DeepSeek API ключ не настроен. Добавьте DEEPSEEK_API_KEY в .env"
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        logger.info(f"Отправляем {len(messages_list)} сообщений в DeepSeek API")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": messages_list,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        url = self._build_api_url()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                if stream:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code != 200:
                            error_text = await response.aread()
                            logger.error(
                                f"Ошибка API DeepSeek: {response.status_code} - {error_text}"
                            )
                            yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                            return

                        async for line in response.aiter_lines():
                            if line.startswith('data: '):
                                data = line[6:]
                                if data == '[DONE]':
                                    break
                                try:
                                    chunk = json.loads(data)
                                    if 'choices' in chunk and len(chunk['choices']) > 0:
                                        delta = chunk['choices'][0].get('delta', {})
                                        content = delta.get('content', '')
                                        if content:
                                            yield content
                                except json.JSONDecodeError:
                                    continue
                else:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code != 200:
                        error_text = response.text
                        logger.error(
                            f"Ошибка API DeepSeek: {response.status_code} - {error_text}"
                        )
                        yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                        return

                    result = response.json()
                    if 'choices' in result and len(result['choices']) > 0:
                        content = result['choices'][0].get('message', {}).get('content', '')
                        yield content

            except httpx.TimeoutException:
                logger.error("Таймаут при обращении к DeepSeek API")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                logger.error(f"Ошибка при обращении к DeepSeek API: {str(e)}")
                yield f"\n⚠️ Ошибка: {str(e)}\n"