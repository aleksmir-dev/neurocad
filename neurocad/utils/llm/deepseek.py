# neurocad/utils/llm/deepseek.py

"""
DeepSeek provider (OpenAI-compatible API).

Supports reasoning models (V4.1-Flash, R1) — thinking mode is
controlled by the `thinking` config flag:

  thinking=False (default) → payload carries "thinking": {"type":"disabled"}.
                             Fast, no reasoning, content comes back
                             directly.

  thinking=True             → payload omits the field entirely, so the
                             model uses its own default (thinking ON
                             for V4.1-Flash). Slower (2–5×), but the
                             model reasons before answering — better
                             for analysis / QA tasks.

When thinking is ON, the response carries:
  - `reasoning_content` — the internal monologue (ignored on success);
  - `content`            — the final answer, ready to parse.

If `max_tokens` is exhausted during the thinking phase, `content`
comes back empty and the whole answer lives in `reasoning_content`.
The provider falls back to `reasoning_content` in that case.

Raising `max_output_tokens` (via config) and `timeout` (via config) is
recommended when thinking is enabled — the model has more work to do.
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
# TOKENIZER
# ============================================

def get_deepseek_tokenizer():
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
    """DeepSeek API client (OpenAI-compatible)."""

    name = "deepseek"

    def __init__(self, config: dict, log=None):
        super().__init__()

        self.api_key = config.get("api_key") or ""
        self.base_url = (config.get("base_url") or "https://api.deepseek.com").rstrip("/")
        self.model = config.get("model") or "deepseek-flash"
        self.max_output_tokens = config.get("max_output_tokens") or 12000
        self.timeout = config.get("timeout") or 150
        self.thinking = bool(config.get("thinking", False))

        self.log = log

    # ============================================
    # TOKEN COUNTING
    # ============================================

    def count_tokens(self, text: str) -> int:
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
    # DUMP HELPERS
    # ============================================

    def _dump_response(self, result: dict, reason: str = "") -> None:
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
                        "thinking": self.thinking,
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
        self._reset_tokens()

        if not self.is_configured:
            yield "Ошибка: DeepSeek API ключ не настроен."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        for m in messages_list or []:
            self._add_tokens(m.get("content", "") if isinstance(m, dict) else "")

        self._log_info(
            f"Отправляем {len(messages_list)} сообщений в DeepSeek API "
            f"(thinking={self.thinking}, max_tokens={max_tokens})"
        )

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

        # ---- thinking control ----
        # OFF: explicitly disable the thinking phase (V4.1-Flash / R1
        #      would otherwise default to ON and burn max_tokens on
        #      reasoning).
        # ON:  omit the field entirely so the model uses its own
        #      default. Sending "enabled" is not guaranteed to be
        #      accepted — omitting is the safest way to say "your
        #      default, please".
        if not self.thinking:
            payload["thinking"] = {"type": "disabled"}

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
                                        content = (
                                            delta.get('content')
                                            or delta.get('reasoning_content')
                                            or ''
                                        )
                                        if content:
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
                            self._log_info(
                                f"content empty, used reasoning_content "
                                f"({len(reasoning)} chars, "
                                f"finish_reason={finish!r})"
                            )
                            if finish == "length":
                                self._dump_response(
                                    result, reason="truncated_reasoning"
                                )
                                self._log_reasoning_head_tail(reasoning)

                        self._add_tokens(content)
                        yield content

            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"