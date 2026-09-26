# neurocad/utils/llm/yandex.py

"""
YandexGPT provider.

Uses the Yandex Cloud Foundation Models API.
All parameters come from the `config` dict passed by the factory.
Streaming is not implemented.

Logging: `log` is passed explicitly (app.state.log from the endpoint).
If None — provider works silently (CLI, tests).

Error reporting:
  On a non-200 response the provider yields a human-readable message
  built from the response body (extracted via _extract_error_detail),
  not just the status code.

  Yandex returns errors as:
    {"error": {"grpcCode": 16, "httpCode": 401, "message": "...", "httpStatus": "..."}}
  so the nested "error.message" branch is the common one.
"""

import httpx
from typing import AsyncGenerator

from .base import LLMProvider


DEFAULT_TEMPERATURE = 0.3


class YandexProvider(LLMProvider):
    """
    YandexGPT client.

    Config keys (all optional, fallback to hardcoded defaults):
      api_key, folder_id, model, max_output_tokens, timeout

    log — app.state.log from the endpoint (Request / WebSocket).
    """

    name = "yandex"

    API_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

    def __init__(self, config: dict, log=None):
        self.api_key = config.get("api_key") or ""
        self.folder_id = config.get("folder_id") or ""
        self.model = config.get("model") or "yandexgpt-lite"
        self.max_output_tokens = config.get("max_output_tokens") or 4096
        self.timeout = config.get("timeout") or 120

        # app.state.log — приходит из эндпоинта.
        self.log = log

    # ============================================
    # LOG HELPERS
    # ============================================

    def _log_info(self, message: str) -> None:
        if self.log is not None:
            self.log.log_info_sync(target="yandex", message=message)

    def _log_error(self, message: str) -> None:
        if self.log is not None:
            self.log.log_error_sync(target="yandex", message=message)

    def _log_warning(self, message: str) -> None:
        if self.log is not None:
            self.log.log_warning_sync(target="yandex", message=message)

    # ============================================
    # ERROR EXTRACTION
    # ============================================

    def _extract_error_detail(self, response) -> str:
        """
        Pull a human-readable message out of an API error response.

        Tries, in order:
          - JSON: {"error": {"message": "..."}}   ← Yandex format
          - JSON: {"error": "..."}
          - JSON: {"message": "..."}
          - JSON: {"detail": "..."}
          - fallback: raw text, truncated to ~400 chars

        Yandex returns errors as:
          {"error": {"grpcCode": 16, "httpCode": 401,
                     "message": "API key not valid",
                     "httpStatus": "UNAUTHENTICATED"}}

        Never raises.
        """
        try:
            data = response.json()

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
        return bool(self.api_key and self.folder_id)

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
            yield "Ошибка: YandexGPT не настроен. Нужны api_key и folder_id."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

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
                    detail = self._extract_error_detail(response)
                    self._log_error(
                        f"API error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка YandexGPT ({response.status_code}): {detail}\n"
                    return
                result = response.json()
                alternatives = result.get("result", {}).get("alternatives") or []
                if alternatives:
                    text = alternatives[0].get("message", {}).get("text", "")
                    if text:
                        yield text
            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"