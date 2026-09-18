# neurocad/utils/llm/deepseek.py

"""
DeepSeek — клиент для работы с API DeepSeek (OpenAI-совместимый).

Все параметры берутся из settings (config.py).
Поддерживает потоковый и не-потоковый режимы.
"""

import json
import logging
import httpx
import tiktoken
from typing import AsyncGenerator

from neurocad.config import settings

logger = logging.getLogger(__name__)


# ===== Константы (могут переопределяться через settings) =====

MAX_CONTEXT_TOKENS = 1_000_000


# ===== Токенизатор =====

def get_deepseek_tokenizer():
    """Получение токенизатора для DeepSeek"""
    try:
        return tiktoken.encoding_for_model("deepseek-chat")
    except KeyError:
        try:
            return tiktoken.encoding_for_model("cl100k_base")
        except KeyError:
            logger.info("Используем cl100k_base как fallback")
            return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Точный подсчёт токенов"""
    if not text:
        return 0
    try:
        tokenizer = get_deepseek_tokenizer()
        return len(tokenizer.encode(text))
    except Exception as e:
        logger.error(f"Ошибка при подсчёте токенов: {e}")
        return int(len(text) * 0.6)


def truncate_to_context_limit(
    messages_list: list,
    max_tokens: int = MAX_CONTEXT_TOKENS
) -> list:
    """Обрезает историю сообщений до контекстного окна"""
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

    logger.info(f"Контекст обрезан: {len(messages_list)} -> {len(truncated)} сообщений, {total_tokens} токенов")
    return truncated


# ===== API-клиент =====

def _build_api_url() -> str:
    """Собрать полный URL для chat/completions из base_url."""
    base = settings.DEEPSEEK_BASE_URL.rstrip('/')
    return f"{base}/chat/completions"


async def get_response(
    messages_list: list,
    temperature: float = None,
    max_tokens: int = None,
    stream: bool = False
) -> AsyncGenerator[str, None]:
    """
    Асинхронный запрос к DeepSeek API.

    stream=False — отдаёт один chunk (весь ответ).
    stream=True  — отдаёт chunks по мере поступления.
    """
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        yield "Ошибка: DeepSeek API ключ не настроен. Добавьте DEEPSEEK_API_KEY в .env"
        return

    if temperature is None:
        temperature = settings.DEEPSEEK_TEMPERATURE
    if max_tokens is None:
        max_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS

    logger.info(f"Отправляем {len(messages_list)} сообщений в DeepSeek API")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": messages_list,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }

    url = _build_api_url()

    async with httpx.AsyncClient(timeout=settings.DEEPSEEK_TIMEOUT) as client:
        try:
            if stream:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error(f"Ошибка API DeepSeek: {response.status_code} - {error_text}")
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
                    logger.error(f"Ошибка API DeepSeek: {response.status_code} - {error_text}")
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


async def generate_completion(
    messages_list: list,
    temperature: float = None,
    max_tokens: int = None
) -> str:
    """Генерирует полный ответ (не потоковый)"""
    full_response = ""
    async for chunk in get_response(
        messages_list,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False
    ):
        full_response += chunk
    return full_response