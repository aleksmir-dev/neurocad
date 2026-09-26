# neurocad/utils/llm/gemini.py

"""
Google Gemini provider.

Uses the Gemini API (v1beta, generateContent).
All parameters come from the `config` dict passed by the factory.

Messages are converted from OpenAI-style to Gemini format:
  - system  → systemInstruction
  - user    → {role: "user", parts: [...]}
  - assistant → {role: "model", parts: [...]}

Logging: `log` is passed explicitly (app.state.log from the endpoint).
If None — provider works silently (CLI, tests).

Error reporting:
  On a non-200 response the provider yields a human-readable message
  built from the response body (extracted via _extract_error_detail),
  not just the status code. This is what the user sees in the chat.
"""

import httpx
from typing import AsyncGenerator

from .base import LLMProvider


DEFAULT_TEMPERATURE = 0.3


class GeminiProvider(LLMProvider):
    """
    Google Gemini client.

    Config keys (all optional, fallback to hardcoded defaults):
      api_key, model, max_output_tokens, timeout

    log — app.state.log from the endpoint (Request / WebSocket).
    """

    name = "gemini"

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, config: dict, log=None):
        self.api_key = config.get("api_key") or ""
        self.model = config.get("model") or "gemini-1.5-flash"
        self.max_output_tokens = config.get("max_output_tokens") or 8192
        self.timeout = config.get("timeout") or 120

        # app.state.log — приходит из эндпоинта.
        self.log = log

    # ============================================
    # LOG HELPERS
    # ============================================

    def _log_info(self, message: str) -> None:
        if self.log is not None:
            self.log.log_info_sync(target="gemini", message=message)

    def _log_error(self, message: str) -> None:
        if self.log is not None:
            self.log.log_error_sync(target="gemini", message=message)

    def _log_warning(self, message: str) -> None:
        if self.log is not None:
            self.log.log_warning_sync(target="gemini", message=message)

    # ============================================
    # ERROR EXTRACTION
    # ============================================

    def _extract_error_detail(self, response) -> str:
        """
        Pull a human-readable message out of an API error response.

        Tries, in order:
          - JSON: {"error": {"message": "..."}}   ← Gemini / Google format
          - JSON: {"error": "..."}
          - JSON: {"message": "..."}
          - JSON: {"detail": "..."}
          - fallback: raw text, truncated to ~400 chars

        Never raises.
        """
        try:
            data = response.json()

            err = data.get("error")
            # {"error": {"message": "...", "code": 400, "status": "..."}}
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            # {"error": "..."}
            if isinstance(err, str):
                return err

            if data.get("message"):
                return str(data["message"])
            if data.get("detail"):
                return str(data["detail"])

        except Exception:
            pass

        text = (response.text or "").strip()
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
            yield "Ошибка: Gemini API ключ не настроен."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

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

        url = f"{self.BASE_URL}/models/{self.model}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    detail = self._extract_error_detail(response)
                    self._log_error(
                        f"API error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка Gemini ({response.status_code}): {detail}\n"
                    return
                result = response.json()
                candidates = result.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts") or []
                    text = "".join(p.get("text", "") for p in parts)
                    if text:
                        yield text
            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"