# core/engine/lib/llm/agents/_03_none/prompt.py

class CoreEngineLibLlmAgentsNonePrompt:
    """
    Prompt class for the 'none' agent.
    Since this agent doesn't use an LLM, the prompt is just the canned message.
    """
    
    MESSAGE = (
        "Я помогаю только с редактором NeuroCad. "
        "Спросите про блоки, пресеты, стили, чат или работу редактора."
    )

    @classmethod
    def build(cls) -> str:
        return cls.MESSAGE