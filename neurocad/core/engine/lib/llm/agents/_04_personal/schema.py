# core/engine/lib/llm/agents/_04_personal/schema.py

"""Request / response schemas for the _04_personal agent."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class CoreEngineLibLlmAgentsPersonalRequest(BaseModel):
    """Single request for any stage: brief / base / effects."""

    prompt: str = ""
    stage: Optional[str] = Field(
        default="base",
        description='"brief" | "base" | "effects"',
    )
    target_section: Optional[str] = Field(
        default=None,
        description='Секция для stage="effects": "hero" | "projects" | "footer".',
    )

    # New stateless state (preferred). If both state and run_id are
    # missing, the service starts from a fresh PageState.
    state: Optional[Dict[str, Any]] = Field(
        default=None,
        description="PageState.to_dict(): html + css_by_section + color_hint + history.",
    )
    run_id: Optional[int] = Field(
        default=None,
        description="Load state from Run by id when `state` is not provided.",
    )

    # Effects tuning.
    effects_mode: Optional[str] = Field(
        default=None,
        description='"replace" | "append"; defaults to constants.DEFAULT_EFFECTS_MODE.',
    )
    n_effects: Optional[int] = Field(
        default=None,
        description="How many effects to sample; defaults to constants.DEFAULT_N_EFFECTS.",
    )
    seed: Optional[int] = Field(
        default=None,
        description="Deterministic effects sampling when set.",
    )

    # Deprecated: kept for backward compatibility with the old notebook.
    current_html: Optional[str] = Field(default=None, description="[deprecated] Use state.")
    current_css: Optional[str] = Field(default=None, description="[deprecated] Use state.")
    css_by_section: Optional[Dict[str, str]] = Field(default=None, description="[deprecated] Use state.")
    history: Optional[List[Dict[str, Any]]] = Field(default=None, description="[deprecated] Use state.")


class CoreEngineLibLlmAgentsPersonalData(BaseModel):
    """Stage payload (subset is filled depending on stage)."""

    html: Optional[str] = Field(default=None, description="base: full page; effects: target section.")
    css: Optional[str] = Field(default=None, description="Joined CSS (base: all sections).")
    css_by_section: Optional[Dict[str, str]] = Field(default=None, description="Per-section CSS.")
    section: Optional[str] = Field(default=None, description='Echo of target_section on effects.')
    question: Optional[str] = Field(default=None, description="brief: next question.")
    ready: Optional[bool] = Field(default=None, description="brief: dialog finished.")
    warning: Optional[str] = Field(default=None, description="brief: model returned non-JSON.")

    # New: full state after the operation — client passes it back next call.
    state: Optional[Dict[str, Any]] = Field(default=None, description="PageState.to_dict() after the op.")


class CoreEngineLibLlmAgentsPersonalResponse(BaseModel):
    """Envelope returned by POST /_04_personal/generate."""

    success: bool
    data: Optional[CoreEngineLibLlmAgentsPersonalData] = None
    error: Optional[str] = None