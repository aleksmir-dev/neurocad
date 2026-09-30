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

Reasoning-model support (V4.1-Flash / R1):
  DeepSeek V4.1-Flash may run in "thinking" mode. In that mode the
  model spends part of `max_tokens` on an internal `reasoning_content`
  field before producing the final `content`. If `max_tokens` is
  exhausted during thinking, `content` comes back empty and the whole
  answer lives in `reasoning_content`.

  Mitigations implemented here:
    1. `_extract_message_content()` — falls back to `reasoning_content`
       when `content` is empty (non-streaming path).
    2. Streaming path checks both `content` and `reasoning_content`
       in each delta.
    3. `thinking: {type: disabled}` is sent in the payload to ask the
       model to skip the thinking phase entirely (ignored by models
       that don't support it).
    4. On suspicious responses (empty content, finish_reason=length),
       the full raw JSON is dumped to /tmp/neurocad_llm_dumps/ and
       reasoning head/tail is logged.

Token accounting:
  `self.tokens_used` is reset at the start of get_response(), then
  incremented for every input message and every yielded chunk. After
  the generator is fully consumed, it holds the total cost.
  The exact tokenizer is cl100k_base (tiktoken).
"""

import json
import os
import httpx
import tiktoken
from datetime import datetime
from typing import AsyncGenerator

from .base import LLMProvider


# ============================================
# CONSTANTS
# ============================================

DEFAULT_TEMPERATURE = 0.3

#: DeepSeek V4.1-Flash supports up to 1M tokens of context.
MAX_CONTEXT_TOKENS = 1_000_000

#: Where to drop raw responses for post-mortem analysis.
DUMP_DIR = "/tmp/neurocad_llm_dumps"


# ============================================
# TOKENIZER (module-level helpers)
# ============================================
#
# NOTE: these are standalone helpers for use outside the class
# (CLI, tests). The provider class overrides `count_tokens` and
# uses the same tokenizer internally.

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
    """Approximate token count using cl100k_base (fallback: len * 0.6)."""
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
        # Initialize LLMProvider (sets self.tokens_used = 0)
        super().__init__()

        self.api_key = config.get("api_key") or ""
        self.base_url = (config.get("base_url") or "https://api.deepseek.com").rstrip("/")
        self.model = config.get("model") or "deepseek-flash"
        self.max_output_tokens = config.get("max_output_tokens") or 12000
        self.timeout = config.get("timeout") or 150

        # app.state.log — приходит из эндпоинта.
        self.log = log

    # ============================================
    # TOKEN COUNTING
    # ============================================

    def count_tokens(self, text: str) -> int:
        """Exact count via cl100k_base (falls back to len * 0.6)."""
        return count_tokens(text)

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

        DeepSeek uses the OpenAI error format:
          {"error": {"message": "Authentication Fails", "type": "...", "code": "..."}}
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
    # RESPONSE CONTENT EXTRACTION
    # ============================================

    @staticmethod
    def _extract_message_content(message: dict) -> str:
        """
        Pull the assistant's answer out of a non-streaming response.

        Standard OpenAI-compatible shape:
            {"role": "assistant", "content": "..."}

        Reasoning-model shape (DeepSeek V4.1-Flash / R1 in thinking mode):
            {"role": "assistant",
             "content": "",
             "reasoning_content": "Thinking Process: ..."}

        If the model exhausted `max_tokens` while still in the thinking
        phase, `content` comes back empty and everything is in
        `reasoning_content`. Reading `content` only would yield "" and
        the caller would treat the response as malformed.

        Priority:
          1. `content` — if non-empty, use it.
          2. `reasoning_content` — fallback when content is empty.
          3. "" — nothing usable.
        """
        if not isinstance(message, dict):
            return ""

        content = message.get("content") or ""
        if content.strip():
            return content

        reasoning = message.get("reasoning_content") or ""
        if reasoning.strip():
            return reasoning

        return ""

    # ============================================
    # DUMP HELPERS (post-mortem analysis)
    # ============================================

    def _dump_response(self, result: dict, reason: str = "") -> None:
        """
        Dump the full raw response to a file for post-mortem analysis.

        Called when the response looks suspicious:
          - empty content with non-empty reasoning (truncated thinking),
          - finish_reason == 'length',
          - no content at all.

        Files land in /tmp/neurocad_llm_dumps/ with a timestamp and a
        short reason tag in the filename, so you can `ls -lt` and open
        the latest one.
        """
        try:
            os.makedirs(DUMP_DIR, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            safe_reason = "".join(
                c if c.isalnum() or c in "_-" else "_" for c in (reason or "dump")
            )[:40]
            path = os.path.join(DUMP_DIR, f"deepseek_{ts}_{safe_reason}.json")

            with open(path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "model": self.model,
                        "max_output_tokens": self.max_output_tokens,
                        "reason": reason,
                        "response": result,
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )

            self._log_info(f"raw response dumped -> {path}")
        except Exception as e:
            self._log_warning(f"dump failed: {e}")

    def _log_reasoning_head_tail(self, reasoning: str) -> None:
        """Log the first and last 500 chars of reasoning_content."""
        if not reasoning:
            return
        head = reasoning[:500].replace("\n", " ")
        tail = reasoning[-500:].replace("\n", " ")
        self._log_warning(f"reasoning HEAD: {head}")
        self._log_warning(f"reasoning TAIL: {tail}")

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
        # Reset the per-call token counter.
        self._reset_tokens()

        if not self.is_configured:
            yield "Ошибка: DeepSeek API ключ не настроен."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        # Count input (prompt) tokens.
        for m in messages_list or []:
            self._add_tokens(m.get("content", "") if isinstance(m, dict) else "")

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
            # Ask V4.1-Flash / R1 to skip the thinking phase.
            # For models that don't know this parameter DeepSeek
            # ignores unknown top-level fields, so this is safe.
            # If the model does honor it, we get the answer directly
            # in `content` and avoid burning max_tokens on reasoning.
            "thinking": {"type": "disabled"},
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
                                        # Prefer `content`; fall back to
                                        # `reasoning_content` for reasoning
                                        # models (DeepSeek V4.1-Flash / R1)
                                        # whose deltas may carry only
                                        # reasoning while thinking.
                                        content = (
                                            delta.get('content')
                                            or delta.get('reasoning_content')
                                            or ''
                                        )
                                        if content:
                                            # Count output (completion) tokens.
                                            self._add_tokens(content)
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
                        choice = result['choices'][0]
                        message = choice.get('message', {}) or {}
                        finish = choice.get('finish_reason')
                        reasoning = message.get('reasoning_content') or ''
                        raw_content = message.get('content') or ''

                        content = self._extract_message_content(message)

                        if not content:
                            # Nothing usable at all — log everything.
                            self._log_warning(
                                f"empty content. "
                                f"finish_reason={finish!r}, "
                                f"reasoning_len={len(reasoning)}, "
                                f"max_tokens={max_tokens}, "
                                f"model={self.model}"
                            )
                            self._dump_response(result, reason=f"empty_{finish}")
                            self._log_reasoning_head_tail(reasoning)
                        elif not raw_content.strip():
                            # content was empty, reasoning_content saved us.
                            self._log_info(
                                f"content empty, used reasoning_content "
                                f"({len(reasoning)} chars, "
                                f"finish_reason={finish!r})"
                            )
                            if finish == "length":
                                # Reasoning was truncated by max_tokens.
                                # The answer might be incomplete.
                                self._dump_response(
                                    result, reason="truncated_reasoning"
                                )
                                self._log_reasoning_head_tail(reasoning)

                        # Count output tokens.
                        self._add_tokens(content)
                        yield content

            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"