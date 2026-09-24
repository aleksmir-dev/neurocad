# neurocad/utils/llm/gigachat.py

"""
GigaChat provider (Sber).

Two-step flow:
  1. POST /api/v2/oauth with the auth key → access_token.
  2. POST /api/v1/chat/completions with the access_token.

Settings (all optional):
  GIGACHAT_AUTH_KEY          — Basic auth key from Sber
  GIGACHAT_SCOPE             (default: GIGACHAT_API_PERS)
  GIGACHAT_MODEL             (default: GigaChat)
  GIGACHAT_MAX_OUTPUT_TOKENS (default: 4096)
  GIGACHAT_TIMEOUT           (default: 120)
  GIGACHAT_CA_PEM            — path to the root CA certificate (optional)

About TLS:
  GigaChat uses a certificate issued by the Russian Ministry of Digital
  Development. It is not in the standard CA bundle, so httpx will fail
  the TLS handshake unless you either:
    - point GIGACHAT_CA_PEM at the certificate file, or
    - disable verification (NOT recommended for production).
  For local development, set GIGACHAT_VERIFY_SSL=false in .env.
"""

import logging
import uuid
from typing import AsyncGenerator

import httpx

from neurocad.config import settings
from .base import LLMProvider

logger = logging.getLogger(__name__)

DEFAULT_TEMPERATURE = 0.3


class GigaChatProvider(LLMProvider):
    """GigaChat client."""

    name = "gigachat"

    OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

    def __init__(self):
        self.auth_key = getattr(settings, "GIGACHAT_AUTH_KEY", None) or ""
        self.scope = (
            getattr(settings, "GIGACHAT_SCOPE", None) or "GIGACHAT_API_PERS"
        )
        self.model = getattr(settings, "GIGACHAT_MODEL", None) or "GigaChat"
        self.max_output_tokens = (
            getattr(settings, "GIGACHAT_MAX_OUTPUT_TOKENS", None) or 4096
        )
        self.timeout = getattr(settings, "GIGACHAT_TIMEOUT", None) or 120

        # TLS: either a path to the CA file, or a boolean flag.
        self.ca_pem = getattr(settings, "GIGACHAT_CA_PEM", None) or None
        self.verify_ssl = getattr(settings, "GIGACHAT_VERIFY_SSL", True)

    @property
    def is_configured(self) -> bool:
        return bool(self.auth_key)

    def _httpx_verify(self):
        """Return the value for httpx `verify=` parameter."""
        if self.ca_pem:
            return self.ca_pem
        return self.verify_ssl

    async def _get_access_token(self, client: httpx.AsyncClient) -> str | None:
        headers = {
            "Authorization": f"Basic {self.auth_key}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        data = {"scope": self.scope}
        try:
            response = await client.post(
                self.OAUTH_URL,
                headers=headers,
                data=data,
                timeout=30,
            )
            if response.status_code != 200:
                logger.error(
                    f"GigaChat OAuth error: {response.status_code} - {response.text}"
                )
                return None
            return response.json().get("access_token")
        except Exception as e:
            logger.error(f"GigaChat OAuth exception: {e}")
            return None

    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        if not self.is_configured:
            yield "Ошибка: GigaChat не настроен. Добавьте GIGACHAT_AUTH_KEY в .env"
            return

        if temperature is None:
            temperature = DEFAULT_TEMPERATURE
        if max_tokens is None:
            max_tokens = self.max_output_tokens

        verify = self._httpx_verify()

        async with httpx.AsyncClient(timeout=self.timeout, verify=verify) as client:
            token = await self._get_access_token(client)
            if not token:
                yield "\n⚠️ Ошибка: не удалось получить токен GigaChat\n"
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
                response = await client.post(self.API_URL, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error(
                        f"GigaChat error: {response.status_code} - {response.text}"
                    )
                    yield f"\n⚠️ Ошибка: API вернул статус {response.status_code}\n"
                    return

                result = response.json()
                choices = result.get("choices") or []
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content:
                        yield content

            except httpx.TimeoutException:
                logger.error("GigaChat: timeout")
                yield "\n⚠️ Ошибка: Превышено время ожидания ответа\n"
            except Exception as e:
                logger.error(f"GigaChat: {e}")
                yield f"\n⚠️ Ошибка: {str(e)}\n"