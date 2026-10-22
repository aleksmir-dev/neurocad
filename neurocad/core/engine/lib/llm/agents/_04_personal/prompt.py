# core/engine/lib/llm/agents/_04_personal/prompt.py

from .prompts._01_brief import CoreEngineLibLlmAgentsPersonalPromptsBrief
from .prompts._02_base import CoreEngineLibLlmAgentsPersonalPromptsBase
from .prompts._03_effects import CoreEngineLibLlmAgentsPersonalPromptsEffects


class CoreEngineLibLlmAgentsPersonalPrompt:
    """
    Dispatcher for personal page prompts.
    """

    @classmethod
    def build_brief(cls) -> str:
        return CoreEngineLibLlmAgentsPersonalPromptsBrief.build()

    @classmethod
    def build_base(cls) -> str:
        return CoreEngineLibLlmAgentsPersonalPromptsBase.build()

    @classmethod
    def build_effects(
        cls,
        target_section: str,
        current_html: str = "",
        current_css: str = "",
    ) -> str:
        return CoreEngineLibLlmAgentsPersonalPromptsEffects.build(
            target_section=target_section,
            current_html=current_html,
            current_css=current_css,
        )