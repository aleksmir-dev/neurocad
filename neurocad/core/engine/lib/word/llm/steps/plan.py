# neurocad/core/engine/lib/word/llm/steps/plan.py

"""
Step 1 of the multi-step LLM flow: PLAN.

Given a catalog of available blocks (id + label + category, no HTML),
the model picks which blocks to use and in what order, and returns a
JSON object with a "plan" array.

Namespace: CoreEngineLibWordLlmSteps
"""

from typing import Any, AsyncGenerator, Dict, List, Optional

from ..prompts.plan import build_plan_prompt
from ..dumper import CoreEngineLibWordLlmDumper
from .common import build_messages, extract_json, log


async def step_plan(
    user_message: str,
    block_catalog: List[Dict[str, Any]],
    provider,
    history: Optional[List[Dict[str, str]]] = None,
    run_id: Any = None,
    agent_name: str = "create",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Step 1: choose which blocks to use and in what order.
    """
    log(
        provider, "info",
        f"plan start: agent={agent_name} run={run_id!r} "
        f"blocks={len(block_catalog)} history={len(history) if history else 0}",
    )

    yield {
        "type": "step",
        "step": "planning",
        "message": "Выбираю подходящие блоки...",
    }

    system_prompt = build_plan_prompt(block_catalog)
    user_content = f"Запрос: {user_message}"
    messages = build_messages(system_prompt, user_content, history)

    # ---- dump full prompt ----
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
        log(provider, "error", f"plan LLM error: {e}")
        yield {"type": "error", "message": f"LLM error: {e}"}
        return

    # ---- dump response ----
    CoreEngineLibWordLlmDumper.dump_response(
        run_id=run_id,
        agent_name=agent_name,
        raw_response=raw,
    )

    plan = parse_plan(raw)
    if not plan:
        yield {"type": "error", "message": "Не удалось разобрать план блоков."}
        return

    yield {"type": "plan", "blocks": plan}
    yield {"type": "result", "plan": plan}


def parse_plan(text: str) -> List[Dict[str, Any]]:
    """Parse the model's plan response into a list of {block_id, purpose}."""
    data = extract_json(text)
    if not data:
        return []

    raw_plan = data.get("plan") or []
    result: List[Dict[str, Any]] = []
    for item in raw_plan:
        if not isinstance(item, dict):
            continue
        bid = item.get("block_id")
        if not bid:
            continue
        result.append({
            "block_id": str(bid),
            "purpose": str(item.get("purpose", "")).strip(),
        })
    return result