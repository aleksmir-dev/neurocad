# neurocad/core/engine/lib/base/setup/schema.py

"""
Setup schemas.

Pydantic models for the setup pages:
  - LLM settings (active provider + per-provider configs).

The settings row is stored in the `settings` table with:
  domain     = 'neurocad'
  subsys     = 'setup'
  module     = 'llm'
  section    = NULL
  key        = 'llm'
  value      = JSON (CoreEngineLibBaseSetupLlmSettings shape,
                     secrets encrypted)

API:
  GET  /core/engine/lib/base/setup/llm — read current settings
  PUT  /core/engine/lib/base/setup/llm — save settings

Namespace: CoreEngineLibBaseSetup*
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field


# ============================================
# PROVIDER CONFIG
# ============================================

class CoreEngineLibBaseSetupLlmProviderConfig(BaseModel):
    """
    Per-provider configuration.

    All fields are optional — different providers need different fields:

      deepseek: api_key, base_url, model, max_output_tokens, timeout
      openai:   api_key, base_url, model, max_output_tokens, timeout
      yandex:   api_key, folder_id, model, max_output_tokens, timeout
      gigachat: auth_key, scope, ca_pem, model, max_output_tokens, timeout
      gemini:   api_key, model, max_output_tokens, timeout

    Secret fields (api_key, auth_key, ca_pem) are encrypted at rest
    when stored in the DB, and decrypted before being sent to the client.
    """
    api_key: Optional[str] = None
    auth_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    max_output_tokens: Optional[int] = None
    timeout: Optional[int] = None

    # Yandex-specific
    folder_id: Optional[str] = None

    # GigaChat-specific
    scope: Optional[str] = None
    ca_pem: Optional[str] = None


# ============================================
# LLM SETTINGS (payload inside settings.value)
# ============================================

class CoreEngineLibBaseSetupLlmSettings(BaseModel):
    """
    LLM settings — shape of the JSON stored in settings.value.

    active_provider — one of the provider keys in `providers`.
    providers       — dict: provider name → provider config.
    """
    active_provider: str = Field(
        "deepseek",
        description="Active provider: deepseek | openai | yandex | gigachat | gemini",
    )
    providers: Dict[str, CoreEngineLibBaseSetupLlmProviderConfig] = Field(
        default_factory=dict,
        description="Map of provider name → provider config",
    )


# ============================================
# API — GET
# ============================================

class CoreEngineLibBaseSetupLlmResponse(BaseModel):
    """
    Response for GET /core/engine/lib/base/setup/llm.

    crypto_available — True if NEUROCAD_SECRET_KEY is configured and valid.
                       If False, the client should warn the user that
                       secrets are stored in plaintext.
    """
    success: bool = True
    data: CoreEngineLibBaseSetupLlmSettings
    crypto_available: bool = False


# ============================================
# API — PUT
# ============================================

class CoreEngineLibBaseSetupLlmUpdateRequest(BaseModel):
    """
    Request for PUT /core/engine/lib/base/setup/llm.

    Full replacement of the LLM settings — the client always sends
    the complete document. Secrets are sent in plaintext (the client
    just fetched them decrypted); the server encrypts them before
    persisting.
    """
    active_provider: str = Field(
        ...,
        description="Active provider name",
    )
    providers: Dict[str, CoreEngineLibBaseSetupLlmProviderConfig] = Field(
        ...,
        description="Map of provider name → provider config",
    )


class CoreEngineLibBaseSetupLlmUpdateResponse(BaseModel):
    """
    Response for PUT /core/engine/lib/base/setup/llm.

    Returns the saved state (with secrets decrypted again — so the
    client can keep the values in form fields), plus a status message.
    """
    success: bool = True
    data: CoreEngineLibBaseSetupLlmSettings
    crypto_available: bool = False
    message: Optional[str] = None