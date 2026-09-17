# app/utils/llm/deepseek.py

import json
import logging
import httpx
import tiktoken
from typing import AsyncGenerator
from neurocad.config import settings

logger = logging.getLogger(__name__)

# Все параметры DeepSeek
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_CONTEXT_TOKENS = 1_000_000
MAX_OUTPUT_TOKENS = 12000  # увеличил с 8000 до 12000 для более длинных статей
DEFAULT_TEMPERATURE = 0.3   # уменьшил с 0.4 до 0.3 для более точных и логичных ответов
WEB_SEARCH_ENABLED = True
SEARCH_MAX_RESULTS = 8       # увеличил с 5 до 8 для большего количества источников
SEARCH_FRESHNESS = "week"
SEARCH_LANGUAGE = "ru,en"


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

        if total_tokens + msg_tokens > max_tokens - MAX_OUTPUT_TOKENS:
            break

        truncated.insert(0, msg)
        total_tokens += msg_tokens

    if messages_list and messages_list[0].get('role') == 'system':
        if not truncated or truncated[0].get('role') != 'system':
            truncated.insert(0, messages_list[0])

    logger.info(f"Контекст обрезан: {len(messages_list)} -> {len(truncated)} сообщений, {total_tokens} токенов")
    return truncated


# ===== API-клиент =====

async def get_response_with_web_search(
    messages_list: list,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = MAX_OUTPUT_TOKENS,
    stream: bool = False
) -> AsyncGenerator[str, None]:
    """Асинхронный запрос к DeepSeek API с веб-поиском"""
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        yield "Ошибка: DeepSeek API ключ не настроен. Добавьте DEEPSEEK_API_KEY в .env"
        return

    logger.info(f"Отправляем {len(messages_list)} сообщений в DeepSeek API")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages_list,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }

    if WEB_SEARCH_ENABLED:
        payload["enable_web_search"] = True
        payload["search_options"] = {
            "max_results": SEARCH_MAX_RESULTS,
            "freshness": SEARCH_FRESHNESS,
            "language": SEARCH_LANGUAGE
        }

    async with httpx.AsyncClient(timeout=150) as client:  # увеличил таймаут до 150 сек
        try:
            async with client.stream(
                "POST",
                DEEPSEEK_API_URL,
                headers=headers,
                json=payload
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(f"Ошибка API DeepSeek: {response.status_code} - {error_text}")
                    yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                    return

                if stream:
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
                    data = await response.aread()
                    result = json.loads(data)
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
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = MAX_OUTPUT_TOKENS
) -> str:
    """Генерирует полный ответ (не потоковый)"""
    full_response = ""
    async for chunk in get_response_with_web_search(
        messages_list,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True
    ):
        full_response += chunk
    return full_response