# neurocad/core/engine/lib/word/llm/dumper.py

"""
Dump every prompt sent to the LLM and the raw response back to disk.

Namespace: CoreEngineLibWordLlmDumper

Layout:
    <cwd>/log/llm-prompts/run-<id>/
        meta.txt
        NN-<agent>-system.txt
        NN-<agent>-user.txt
        NN-<agent>-user-chunk-N.txt
        NN-<agent>-history.txt
        NN-<agent>-response.txt
        NN-<agent>-response-chunk-N.txt

`agent` is the agent name: router, help, create, fill, effect, none.
A running counter `NN` keeps the files ordered.

If `run_id` is None, dumping is skipped.
"""

import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class CoreEngineLibWordLlmDumper:
    """Dump prompts and responses to disk, one run per folder."""

    #: Root directory, relative to cwd.
    ROOT_DIR = Path("log") / "llm-prompts"

    #: Per-run counter for file ordering: run_id -> next index.
    _counters: Dict[Any, int] = {}

    # ============================================
    # LOW-LEVEL
    # ============================================

    @staticmethod
    def _run_dir(run_id: Any) -> Path:
        return CoreEngineLibWordLlmDumper.ROOT_DIR / f"run-{run_id}"

    @staticmethod
    def _ensure_run_dir(run_id: Any) -> Path:
        d = CoreEngineLibWordLlmDumper._run_dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        return d

    @staticmethod
    def _next_index(run_id: Any) -> int:
        idx = CoreEngineLibWordLlmDumper._counters.get(run_id, 0) + 1
        CoreEngineLibWordLlmDumper._counters[run_id] = idx
        return idx

    @staticmethod
    def _write(run_id: Any, filename: str, content: str) -> None:
        if run_id is None:
            return
        try:
            d = CoreEngineLibWordLlmDumper._ensure_run_dir(run_id)
            path = d / filename
            with open(path, "w", encoding="utf-8") as f:
                f.write(content or "")
        except Exception as e:
            print(
                f"[dumper] failed to write {filename} for run={run_id}: {e!r}",
                flush=True,
            )

    # ============================================
    # META
    # ============================================

    @staticmethod
    def dump_meta(
        run_id: Any,
        page_id: int,
        user_message: str,
        block_catalog: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Dump a short summary of the run."""
        if run_id is None:
            return
        # reset counter for a new run
        CoreEngineLibWordLlmDumper._counters[run_id] = 0

        catalog_size = len(block_catalog or [])
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        content = (
            f"run_id       = {run_id}\n"
            f"page_id      = {page_id}\n"
            f"user_message = {user_message!r}\n"
            f"catalog_size = {catalog_size}\n"
            f"created_at   = {now}\n"
        )
        CoreEngineLibWordLlmDumper._write(run_id, "meta.txt", content)

    # ============================================
    # REQUEST (prompt)
    # ============================================

    @staticmethod
    def dump_step(
        run_id: Any,
        agent_name: str,
        system_prompt: str,
        user_content: str,
        history: Optional[List[Dict[str, str]]] = None,
        chunk_index: Optional[int] = None,
    ) -> None:
        """
        Dump one LLM request.

        agent_name:  'router' | 'help' | 'create' | 'fill' | 'effect' | ...
        chunk_index: None for single-request agents, 1..N for chunked fill.
        """
        if run_id is None:
            return

        idx = CoreEngineLibWordLlmDumper._next_index(run_id)
        prefix = f"{idx:02d}-{agent_name}"

        # System prompt
        CoreEngineLibWordLlmDumper._write(
            run_id, f"{prefix}-system.txt", system_prompt
        )

        # User content
        if chunk_index is not None:
            CoreEngineLibWordLlmDumper._write(
                run_id, f"{prefix}-user-chunk-{chunk_index}.txt", user_content
            )
        else:
            CoreEngineLibWordLlmDumper._write(
                run_id, f"{prefix}-user.txt", user_content
            )

        # History — only once per agent call
        if history and (chunk_index is None or chunk_index == 1):
            lines = []
            for m in history:
                role = m.get("role", "?")
                content = m.get("content", "")
                lines.append(f"=== role={role} ===")
                lines.append(content)
                lines.append("")
            CoreEngineLibWordLlmDumper._write(
                run_id, f"{prefix}-history.txt", "\n".join(lines).rstrip()
            )

    # ============================================
    # RESPONSE
    # ============================================

    @staticmethod
    def dump_response(
        run_id: Any,
        agent_name: str,
        raw_response: str,
        chunk_index: Optional[int] = None,
    ) -> None:
        """
        Dump the raw LLM response for one request.

        agent_name:  same as in dump_step.
        chunk_index: matches dump_step.
        """
        if run_id is None:
            return

        # Reuse the counter established by dump_step so request and
        # response share the same NN.
        current = CoreEngineLibWordLlmDumper._counters.get(run_id, 0)
        prefix = f"{current:02d}-{agent_name}"

        if chunk_index is not None:
            filename = f"{prefix}-response-chunk-{chunk_index}.txt"
        else:
            filename = f"{prefix}-response.txt"

        CoreEngineLibWordLlmDumper._write(run_id, filename, raw_response or "")