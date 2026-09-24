# neurocad/core/engine/lib/word/llm/mock.py

"""
Mock LLM provider.

Namespace: CoreEngineLibWordLlmMock

Same interface as the real providers (utils/llm/*.py):
    async generate_completion(messages) -> str

Returns canned responses for the three steps (plan / fill / effects)
so the whole WS flow can be exercised without burning tokens.
"""

import asyncio
import json


class CoreEngineLibWordLlmMock:
    """Mock LLM provider. No network, no tokens."""

    name = "mock"

    def __init__(self, delay=0.5):
        self.delay = delay
        self.calls = []

    async def generate_completion(self, messages):
        self.calls.append(messages)
        await asyncio.sleep(self.delay)

        system = messages[0]["content"] if messages else ""

        if "архитектор" in system:
            return json.dumps({"plan": [
                {"block_id": "core-hero",     "purpose": "Баннер"},
                {"block_id": "core-features", "purpose": "Преимущества"},
                {"block_id": "core-footer",   "purpose": "Подвал"},
            ]}, ensure_ascii=False)

        if "редактор контента" in system:
            ids = [l[4:-4].strip() for l in messages[-1]["content"].split("\n")
                   if l.startswith("=== ") and l.endswith(" ===")]
            return json.dumps({"filled": [
                {"block_id": bid,
                 "html": f'<section data-b="{bid}"><h2>{bid}</h2><p>текст</p></section>'}
                for bid in ids
            ], "remaining": []}, ensure_ascii=False)

        if "дизайнер" in system:
            user = messages[-1]["content"]
            i = user.find("HTML:\n")
            html = user[i + 6:] if i != -1 else user
            return json.dumps({"html": html + "<style>.effect-mock{opacity:1}</style>"},
                              ensure_ascii=False)

        return json.dumps({"error": "unknown prompt"})