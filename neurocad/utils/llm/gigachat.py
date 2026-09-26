# neurocad/utils/llm/gigachat.py

"""
GigaChat provider (Sber).

Two-step flow: OAuth → chat/completions.

The `auth_key` from Sber Studio can be in one of two formats:

  1. Plain "client_id:client_secret"
  2. base64("client_id:client_secret") — the Authorization Key
     (this is what Sber Studio actually gives you)

The provider detects the format automatically. It talks to the OLD
endpoint (https://ngw.devices.sberbank.ru:9443/api/v2/oauth and
https://gigachat.devices.sberbank.ru/api/v1) with Basic auth — the
new endpoint (api.giga.chat) is blocked by Sber WAF from this server.

TLS: the Ministry of Digital Development root CA (Russian Trusted Root CA)
is not in the system trust store. The PEM text is passed in `config["ca_pem"]`
(plain text) and loaded into an ssl.SSLContext via
`load_verify_locations(cadata=...)`. No temp files — the context is
built in memory.

If `ca_pem` is empty, the default system trust store is used.

Config keys:
  auth_key             — Authorization Key from Sber Studio (required)
  scope                — GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
  model                — e.g. GigaChat-2-Lite
  max_output_tokens, timeout
  ca_pem               — PEM text of the Russian Trusted Root CA (optional)

Logging: `log` is passed explicitly (app.state.log from the endpoint).
If None — provider works silently (CLI, tests).

Error reporting:
  On a non-200 response the provider yields a human-readable message
  built from the response body (extracted via _extract_error_detail),
  not just the status code. This is what the user sees in the chat.
  The same helper is used for the OAuth step — a failed token request
  also surfaces a readable message.
"""

import base64
import ssl
import uuid
from typing import AsyncGenerator, Optional

import httpx

from .base import LLMProvider


DEFAULT_TEMPERATURE = 0.3


class GigaChatProvider(LLMProvider):
    """
    GigaChat client.

    Config keys:
      auth_key       — Authorization Key from Sber Studio.
                       Can be "client_id:client_secret" (plain) or
                       base64("client_id:client_secret").
      scope          — GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
      model          — e.g. GigaChat-2-Lite
      max_output_tokens, timeout
      ca_pem         — PEM text of the Russian Trusted Root CA (optional).
    """

    name = "gigachat"

    # OAuth + chat/completions — old endpoint.
    # api.giga.chat is intentionally NOT used: it is blocked by Sber WAF
    # from this server and answers 403 with an nginx HTML page.
    OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

    def __init__(self, config: dict, log=None):
        self.auth_key = (config.get("auth_key") or "").strip()
        self.scope = config.get("scope") or "GIGACHAT_API_PERS"
        self.model = config.get("model") or "GigaChat-2-Lite"
        self.max_output_tokens = config.get("max_output_tokens") or 8192
        self.timeout = config.get("timeout") or 120

        # PEM text (not a path). If set — loaded into an SSLContext.
        self.ca_pem_text = (config.get("ca_pem") or "").strip() or None
        self._ssl_context: Optional[ssl.SSLContext] = None

        # app.state.log — приходит из эндпоинта (Request / WebSocket).
        self.log = log

        self._check_auth_key()

    # ============================================
    # LOG HELPERS
    # ============================================

    def _log_info(self, message: str) -> None:
        if self.log is not None:
            self.log.log_info_sync(target="gigachat", message=message)

    def _log_error(self, message: str) -> None:
        if self.log is not None:
            self.log.log_error_sync(target="gigachat", message=message)

    def _log_warning(self, message: str) -> None:
        if self.log is not None:
            self.log.log_warning_sync(target="gigachat", message=message)

    # ============================================
    # ERROR EXTRACTION
    # ============================================

    def _extract_error_detail(self, response) -> str:
        """
        Pull a human-readable message out of an API error response.

        Tries, in order:
          - JSON: {"error": {"message": "..."}}
          - JSON: {"error": "..."}
          - JSON: {"message": "..."}
          - JSON: {"detail": "..."}
          - fallback: raw text, truncated to ~400 chars

        GigaChat returns errors as:
          {"status": 404, "message": "No such model"}
        so the plain "message" branch is the common one.

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
    # AUTH KEY
    # ============================================

    def _check_auth_key(self) -> None:
        """Log if the auth_key looks malformed (for diagnostics only)."""
        if not self.auth_key:
            self._log_warning("auth_key is empty")
            return

        try:
            padded = self.auth_key + "=" * (-len(self.auth_key) % 4)
            decoded = base64.b64decode(padded).decode("utf-8")
            if ":" not in decoded:
                self._log_warning(
                    "auth_key does not look like "
                    "base64(client_id:client_secret)"
                )
        except Exception:
            self._log_warning("auth_key is not valid base64")

    @property
    def is_configured(self) -> bool:
        return bool(self.auth_key)

    # ============================================
    # SSL CONTEXT
    # ============================================

    def _build_ssl_context(self) -> ssl.SSLContext:
        ctx = ssl.create_default_context()

        if self.ca_pem_text:
            try:
                ctx.load_verify_locations(cadata=self.ca_pem_text)
                self._log_info("loaded custom CA from PEM text")
            except Exception as e:
                self._log_error(f"failed to load CA PEM: {e}")
        else:
            self._log_info("ca_pem not set — using system trust store")

        return ctx

    def _get_ssl_context(self) -> ssl.SSLContext:
        if self._ssl_context is None:
            self._ssl_context = self._build_ssl_context()
        return self._ssl_context

    # ============================================
    # OAUTH
    # ============================================

    async def _get_access_token(
        self,
        client: httpx.AsyncClient,
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Request an access token.

        Returns (token, error_detail):
          - on success: (token, None)
          - on failure: (None, human-readable error string)

        The caller decides how to present the error — the second element
        is meant to be shown in the chat (see get_response()).
        """
        headers = {
            "Authorization": f"Basic {self.auth_key}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        data = {"scope": self.scope}

        try:
            response = await client.post(
                self.OAUTH_URL, headers=headers, data=data, timeout=30
            )
            if response.status_code != 200:
                detail = self._extract_error_detail(response)
                self._log_error(
                    f"OAuth error: {response.status_code} - {response.text}"
                )
                return None, detail
            return response.json().get("access_token"), None
        except Exception as e:
            self._log_error(f"OAuth exception: {e}")
            return None, str(e)

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
            yield "Ошибка: GigaChat не настроен. Нужен auth_key."
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        ssl_ctx = self._get_ssl_context()

        async with httpx.AsyncClient(timeout=self.timeout, verify=ssl_ctx) as client:
            token, oauth_err = await self._get_access_token(client)
            if not token:
                yield f"\n⚠️ Ошибка GigaChat (OAuth): {oauth_err or 'не удалось получить токен'}\n"
                return

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self.model,
                "messages": messages_list,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            }

            try:
                response = await client.post(
                    self.API_URL, headers=headers, json=payload
                )
                if response.status_code != 200:
                    detail = self._extract_error_detail(response)
                    self._log_error(
                        f"API error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка GigaChat ({response.status_code}): {detail}\n"
                    return
                result = response.json()
                choices = result.get("choices") or []
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content:
                        yield content
            except httpx.TimeoutException:
                self._log_error("timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                self._log_error(str(e))
                yield f"\n⚠️ Ошибка: {str(e)}\n"