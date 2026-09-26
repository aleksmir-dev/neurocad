# neurocad/core/engine/lib/word/llm/steps/fill.py

"""
Step 2 of the multi-step LLM flow: FILL.

Fills the chosen blocks with text, alts, links.

Namespace: CoreEngineLibWordLlmSteps
"""

from typing import Any, AsyncGenerator, Dict, List, Optional

from ..prompts.fill import build_fill_prompt, build_fill_user_message
from ..dumper import CoreEngineLibWordLlmDumper
from .common import build_messages, extract_json, log, split_into_chunks


#: Default max HTML size (bytes) per fill request.
DEFAULT_CHUNK_LIMIT = 15_000

#: When the model reports "remaining" non-empty, shrink the limit
#: for the next attempt.
CHUNK_LIMIT_SHRINK = 0.7

#: Max number of fill attempts to avoid infinite loops.
MAX_FILL_ATTEMPTS = 10


async def step_fill(
    user_message: str,
    plan: List[Dict[str, Any]],
    block_catalog: List[Dict[str, Any]],
    provider,
    history: Optional[List[Dict[str, str]]] = None,
    chunk_limit: Optional[int] = None,
    run_id: Any = None,
    agent_name: str = "create",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Step 2: fill the chosen blocks with text, alts, links.
    """
    if chunk_limit is None:
        chunk_limit = DEFAULT_CHUNK_LIMIT

    log(
        provider, "info",
        f"fill start: agent={agent_name} run={run_id!r} "
        f"plan={len(plan)} blocks, catalog={len(block_catalog)}",
    )

    yield {
        "type": "step",
        "step": "filling",
        "message": "Заполняю текстом...",
    }

    html_by_id: Dict[str, str] = {
        b["id"]: b.get("html", "") for b in block_catalog
    }

    ordered_ids = [p["block_id"] for p in plan]
    if not ordered_ids:
        yield {"type": "result", "filled": {}}
        return

    filled: Dict[str, str] = {}
    remaining = list(ordered_ids)
    current_limit = chunk_limit
    attempts = 0

    while remaining and attempts < MAX_FILL_ATTEMPTS:
        attempts += 1

        chunks = split_into_chunks(remaining, html_by_id, current_limit)
        total = len(chunks)

        for i, chunk in enumerate(chunks, start=1):
            yield {
                "type": "fill_progress",
                "request": i,
                "total": total,
                "block_ids": chunk,
            }

            chunk_payload = [
                {"block_id": bid, "html": html_by_id.get(bid, "")}
                for bid in chunk
            ]
            system_prompt = build_fill_prompt()
            user_content = build_fill_user_message(user_message, chunk_payload)

            messages = build_messages(system_prompt, user_content, history)

            # ---- dump prompt ----
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name=agent_name,
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
                chunk_index=i,
            )

            try:
                raw = await provider.generate_completion(messages)
            except Exception as e:
                log(provider, "error", f"fill LLM error: {e}")
                yield {"type": "error", "message": f"LLM error: {e}"}
                return

            # ---- dump response ----
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name=agent_name,
                raw_response=raw,
                chunk_index=i,
            )

            parsed = parse_fill(raw)
            for item in parsed.get("filled", []):
                bid = item.get("block_id")
                html = item.get("html", "")
                if bid and html:
                    filled[bid] = html

        new_remaining = [bid for bid in ordered_ids if bid not in filled]
        if new_remaining == remaining:
            current_limit = int(current_limit * CHUNK_LIMIT_SHRINK)
            if current_limit < 500:
                log(provider, "error", "fill chunk limit too small, giving up")
                break
        remaining = new_remaining

    yield {"type": "result", "filled": filled}


def parse_fill(text: str) -> Dict[str, Any]:
    """Parse the model's fill response into {filled, remaining}."""
    data = extract_json(text)
    if not data:
        return {"filled": [], "remaining": []}

    filled_raw = data.get("filled") or []
    remaining_raw = data.get("remaining") or []

    filled: List[Dict[str, str]] = []
    for item in filled_raw:
        if not isinstance(item, dict):
            continue
        bid = item.get("block_id")
        html = item.get("html", "")
        if bid:
            filled.append({"block_id": str(bid), "html": str(html)})

    remaining = [str(x) for x in remaining_raw if x]
    return {"filled": filled, "remaining": remaining}