# neurocad/core/engine/lib/word/llm/steps/effects.py

"""
Step 3 of the multi-step LLM flow: EFFECTS.

Applies ready-made effects from the palette to the blocks.

The model does NOT write CSS. It receives the assembled page HTML and
the catalog of effects that are actually available in the editor, and
adds ONE of the ready-made `fx-*` classes to each section.

Namespace: CoreEngineLibWordLlmSteps
"""

from typing import Any, AsyncGenerator, Dict, List, Optional

from ..prompts.effects import build_effects_prompt
from ..dumper import CoreEngineLibWordLlmDumper
from .common import build_messages, extract_json, log


async def step_effects(
    user_message: str,
    assembled_html: str,
    provider,
    history: Optional[List[Dict[str, str]]] = None,
    effect_catalog: Optional[List[Dict[str, Any]]] = None,
    run_id: Any = None,
    agent_name: str = "create",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Step 3: apply ready-made effects from the palette to the blocks.

    `effect_catalog` is the source of truth for the prompt: if it
    contains 8 effects, the model sees exactly those 8; if it is
    empty or missing, `build_effects_prompt` falls back to a small
    hard-coded set.
    """
    catalog_count = len(effect_catalog) if effect_catalog else 0

    log(
        provider, "info",
        f"effects start: agent={agent_name} run={run_id!r} "
        f"html={len(assembled_html)} chars, catalog={catalog_count}",
    )

    yield {
        "type": "step",
        "step": "effects",
        "message": "Добавляю эффекты...",
    }

    system_prompt = build_effects_prompt(effect_catalog)
    user_content = f"Запрос: {user_message}\n\nHTML:\n{assembled_html}"

    messages = build_messages(system_prompt, user_content, history)

    # ---- dump prompt ----
    CoreEngineLibWordLlmDumper.dump_step(
        run_id=run_id,
        agent_name=agent_name,
        system_prompt=system_prompt,
        user_content=user_content,
        history=history,
    )

    try:
        raw = await provider.generate_completion(messages)
    except Exception as e:
        log(provider, "error", f"effects LLM error: {e}")
        yield {"type": "result", "html": assembled_html}
        return

    # ---- dump response ----
    CoreEngineLibWordLlmDumper.dump_response(
        run_id=run_id,
        agent_name=agent_name,
        raw_response=raw,
    )

    parsed = parse_effects(raw)
    html = parsed.get("html") or assembled_html

    yield {"type": "result", "html": html}


def parse_effects(text: str) -> Dict[str, str]:
    """Parse the model's effects response into {html}."""
    data = extract_json(text)
    if not data:
        return {"html": text.strip()}

    html = data.get("html", "")
    if not isinstance(html, str):
        html = ""
    return {"html": html.strip()}