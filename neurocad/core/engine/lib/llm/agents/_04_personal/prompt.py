# core/engine/lib/llm/agents/_04_personal/prompt.py

"""Prompt dispatcher: connects the service to concrete prompt builders."""

from typing import List, Optional

from .prompts._01_brief import CoreEngineLibLlmAgentsPersonalPromptsBrief
from .prompts._02_base import CoreEngineLibLlmAgentsPersonalPromptsBase
from .prompts._03_effects import CoreEngineLibLlmAgentsPersonalPromptsEffects


class CoreEngineLibLlmAgentsPersonalPrompt:
    """Dispatcher for personal page prompts."""

    @classmethod
    def build_brief(cls) -> str:
        """System prompt for the brief (dialog) stage."""
        return CoreEngineLibLlmAgentsPersonalPromptsBrief.build()

    @classmethod
    def build_base(
        cls,
        color_hint: Optional[str] = None,
    ) -> str:
        """System prompt for the base (layout) stage."""
        return CoreEngineLibLlmAgentsPersonalPromptsBase.build(
            color_hint=color_hint,
        )

    @classmethod
    def build_effects(
        cls,
        target_section: str,
        current_html: str = "",
        base_css: str = "",
        color_hint: Optional[str] = None,
        effects: Optional[List[str]] = None,
        seed: Optional[int] = None,
    ) -> str:
        """System prompt for the effects stage (single section)."""
        return CoreEngineLibLlmAgentsPersonalPromptsEffects.build(
            target_section=target_section,
            current_html=current_html,
            base_css=base_css,
            color_hint=color_hint,
            effects=effects or [],
            seed=seed,
        )