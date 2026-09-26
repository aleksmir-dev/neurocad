# neurocad/utils/llm/deepseek.py

"""
DeepSeek provider (OpenAI-compatible API).

Implements the common `LLMProvider` interface. All parameters come
from the `config` dict passed by the factory (loaded from the DB,
with .env / hardcoded defaults as fallback). Supports streaming and
non-streaming modes.

Logging: `log` is passed explicitly (app.state.log from the endpoint).
If None — provider works silently (CLI, tests).

Error reporting:
  On a non-200 response the provider yields a human-readable message
  built from the response body (extracted via _extract_error_detail),
  not just the status code. Works in both streaming and non-streaming
  modes.
"""

import json
import httpx
import tiktoken
from typing import AsyncGenerator

from .base import LLMProvider


# ============================================
# CONSTANTS
# ============================================

DEFAULT_TEMPERATURE = 0.3

#: DeepSeek V4.1-Flash supports up to 1M tokens of context.
MAX_CONTEXT_TOKENS = 1_000_000


# ============================================
# TOKENIZER
# ============================================
#
# NOTE: tokenizer helpers are module-level and have no access to
# app.state.log — they log through the provider instance where possible.
# When called standalone (CLI, tests), they are silent.

def get_deepseek_tokenizer():
    """
    Tokenizer for DeepSeek.

    tiktoken does not ship DeepSeek-specific encodings. DeepSeek V4/V4.1
    use cl100k_base-compatible tokenization, so use it directly.
    """
    try:
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return None


def count_tokens(text: str) -> int:
    if not text:
        return 0
    tokenizer = get_deepseek_tokenizer()
    if tokenizer is None:
        return int(len(text) * 0.6)
    try:
        return len(tokenizer.encode(text))
    except Exception:
        return int(len(text) * 0.6)


# ============================================
# PROVIDER CLASS
# ============================================

class DeepSeekProvider(LLMProvider):
    """
    DeepSeek API client (OpenAI-compatible).

    Config keys (all optional, fallback to hardcoded defaults):
      api_key, base_url, model, max_output_tokens, timeout

    log — app.state.log from the endpoint (Request / WebSocket).
    """

    name = "deepseek"

    def __init__(self, config: dict, log=None):
        self.api_key = config.get("api_key") or ""
        self.base_url = (config.get("base_url") or "https://api.deepseek.com").rstrip("/")
        self.model = config.get("model") or "deepseek-flash"
        self.max_output_tokens = config.get("max_output_tokens") or 12000
        self.timeout = config.get("timeout") or 150

        # app.state.log — приходит из эндпоинта.
        self.log = log

    # ============================================
    # LOG HELPERS
    # ============================================

    def _log_info(self, message: str) -> None:
        if self.log is not None:
            self.log.log_info_sync(target="deepseek", message=message)

    def _log_error(self, message: str) -> None:
        if self.log is not None:
            self.log.log_error_sync(target="deepseek", message=message)

    def _log_warning(self, message: str) -> None:
        if self.log is not None:
            self.log.log_warning_sync(target="deepseek", message=message)

    # ============================================
    # ERROR EXTRACTION
    # ============================================

    def _extract_error_detail(self, raw_text: str) -> str:
        """
        Pull a human-readable message out of an API error response.

        `raw_text` is the response body as a string (works for both
        streaming and non-streaming — the caller reads the body and
        passes the text here).

        DeepSeek uses the OpenAI error format:
          {"error": {"message": "Authentication Fails", "type": "...", "code": "..."}}
        so the nested "error.message" branch is the common one.

        Never raises.
        """
        if not raw_text:
            return "нет деталей"

        try:
            data = json.loads(raw_text)

            err = data.get("error")
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            if isinstance(err, str):
                return err

            if data.get("message"):
                return str(data["message"])
            if data.get("detail"):
                return str(data["detail"])

        except Exception:
            pass

        text = raw_text.strip()
        if not text:
            return "нет деталей"
        if len(text) > 400:
            text = text[:400] + "…"
        return text

    # ============================================
    # CONFIG
    # ============================================

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _build_api_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    # ============================================
    # CHAT
    # ============================================

    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        if not self.is_configured:
            yield "Ошибка: DeepSeek API ключ не настроен."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        self._log_info(f"Отправляем {len(messages_list)} сообщений в DeepSeek API")

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
                            error_bytes = await response.aread()
                            error_text = error_bytes.decode("utf-8", errors="replace")
                            detail = self._extract_error_detail(error_text)
                            self._log_error(
                                f"API error: {response.status_code} - {error_text}"
                            )
                            yield f"\n⚠️ Ошибка DeepSeek ({response.status_code}): {detail}\n"
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
                        detail = self._extract_error_detail(error_text)
                        self._log_error(
                            f"API error: {response.status_code} - {error_text}"
                        )
                        yield f"\n⚠️ Ошибка DeepSeek ({response.status_code}): {detail}\n"
                        return
                    result = response.json()
                    if 'choices' in result and len(result['choices']) > 0:
                        content = result['choices'][0].get('message', {}).get('content', '')
                        yield content

            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"