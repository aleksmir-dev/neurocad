# neurocad/core/engine/lib/word/editor/effects/service.py

"""
CoreEngineLibWordEffectsService — read / write effect CSS files
and the effects registry.

Three things live in two mirrored roots:

  MODEL_ROOT  — source of truth (the package tree):
      <MODEL_ROOT>/neurocad/core/engine/lib/word/editor/effects/
          registry.json
          fx/<id>.css

  STATIC_ROOT — mirror served by nginx (rebuildable, but we write it
                eagerly so a fresh save is visible without a rebuild):
      <STATIC_ROOT>/core/engine/lib/word/editor/effects/
          registry.json
          fx/<id>.css

Both are written on every PUT/POST/DELETE. Reads come from MODEL_ROOT
(source of truth). If a file is missing in MODEL_ROOT, we fall back
to STATIC_ROOT.

The path does NOT include the module name — effects are shared across
all modules.

Namespace: CoreEngineLibWordEffectsService
"""

import json
import os
import re
import tempfile
from typing import List, Optional

from fastapi import HTTPException


# ============================================
# PATHS
# ============================================

#: Relative path inside the package and inside static/.
EFFECTS_PKG_SUBDIR = os.path.join(
    "neurocad", "core", "engine", "lib", "word", "editor", "effects"
)
EFFECTS_STATIC_SUBDIR = os.path.join(
    "core", "engine", "lib", "word", "editor", "effects"
)
FX_SUBDIR = "fx"
REGISTRY_NAME = "registry.json"

#: Strict slug: fx-<lowercase letters / digits / dashes>.
EFFECT_ID_RE = re.compile(r"^fx-[a-z0-9][a-z0-9-]{0,63}$")

#: Forbidden CSS constructs (best-effort; frontend sanitizes too).
_FORBIDDEN = [
    re.compile(r"@import", re.IGNORECASE),
    re.compile(r"expression\s*\(", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"behavior\s*:", re.IGNORECASE),
    re.compile(r"-moz-binding", re.IGNORECASE),
    re.compile(r"url\s*\(\s*['\"]?\s*javascript:", re.IGNORECASE),
]

#: Current registry schema version.
REGISTRY_VERSION = 1


class CoreEngineLibWordEffectsService:
    """Read / write effect CSS files + registry in package + static trees."""

    # ============================================
    # PATH HELPERS
    # ============================================

    @staticmethod
    def _project_root() -> str:
        """
        Absolute path of the project root.

        From:
          .../<project>/neurocad/core/engine/lib/word/editor/effects/service.py
        To:
          .../<project>/
        """
        here = os.path.abspath(__file__)
        # effects → editor → word → lib → engine → core → neurocad → <project>
        return os.path.normpath(
            os.path.join(here, "..", "..", "..", "..", "..", "..", "..", "..")
        )

    @staticmethod
    def _static_root() -> str:
        """
        Absolute path of the static root.

        Layout:
            <project>/test/static/
        """
        # Default layout for the dev/test setup. If your production
        # layout differs, change this single line.
        return os.path.join(
            CoreEngineLibWordEffectsService._project_root(),
            "test",
            "static",
        )

    @staticmethod
    def _pkg_effects_dir() -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._project_root(),
            EFFECTS_PKG_SUBDIR,
        )

    @staticmethod
    def _static_effects_dir() -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._static_root(),
            EFFECTS_STATIC_SUBDIR,
        )

    @staticmethod
    def _pkg_file_path(effect_id: str) -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._pkg_effects_dir(),
            FX_SUBDIR,
            f"{effect_id}.css",
        )

    @staticmethod
    def _static_file_path(effect_id: str) -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._static_effects_dir(),
            FX_SUBDIR,
            f"{effect_id}.css",
        )

    @staticmethod
    def _pkg_registry_path() -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._pkg_effects_dir(),
            REGISTRY_NAME,
        )

    @staticmethod
    def _static_registry_path() -> str:
        return os.path.join(
            CoreEngineLibWordEffectsService._static_effects_dir(),
            REGISTRY_NAME,
        )

    # ============================================
    # VALIDATION
    # ============================================

    @staticmethod
    def _validate_effect_id(effect_id: str) -> None:
        if not effect_id or not EFFECT_ID_RE.match(effect_id):
            raise HTTPException(
                status_code=400,
                detail=f"Некорректный effect_id: {effect_id!r}",
            )

    @staticmethod
    def _sanitize_css(css: str) -> str:
        """Best-effort CSS sanitization."""
        if not css or not css.strip():
            raise HTTPException(status_code=400, detail="Пустой CSS")

        for re_bad in _FORBIDDEN:
            if re_bad.search(css):
                raise HTTPException(
                    status_code=400,
                    detail=f"CSS содержит запрещённую конструкцию: {re_bad.pattern}",
                )

        return css

    # ============================================
    # REGISTRY — READ / WRITE
    # ============================================

    @staticmethod
    def _read_registry() -> dict:
        """
        Read the registry from the package tree (source of truth).

        Falls back to the static tree if the package copy is missing.

        Returns a dict with at least {"version": N, "effects": [...]}.
        If neither file exists, returns an empty registry.
        """
        candidates = [
            CoreEngineLibWordEffectsService._pkg_registry_path(),
            CoreEngineLibWordEffectsService._static_registry_path(),
        ]

        for path in candidates:
            if os.path.isfile(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except (OSError, json.JSONDecodeError) as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Не удалось прочитать реестр {path}: {e}",
                    )

                if not isinstance(data, dict):
                    raise HTTPException(
                        status_code=500,
                        detail=f"Реестр {path} имеет неверный формат",
                    )

                if "effects" not in data or not isinstance(data["effects"], list):
                    data["effects"] = []
                if "version" not in data:
                    data["version"] = REGISTRY_VERSION

                return data

        return {"version": REGISTRY_VERSION, "effects": []}

    @staticmethod
    def _write_registry(registry: dict) -> None:
        """
        Write the registry to both the package tree and the static tree
        (atomically).
        """
        payload = json.dumps(registry, ensure_ascii=False, indent=2)
        if not payload.endswith("\n"):
            payload += "\n"

        for path in (
            CoreEngineLibWordEffectsService._pkg_registry_path(),
            CoreEngineLibWordEffectsService._static_registry_path(),
        ):
            CoreEngineLibWordEffectsService._write_atomic(path, payload)

    # ============================================
    # LIST
    # ============================================

    @staticmethod
    def list_effects() -> List[dict]:
        """
        Return the list of registered effects, sorted by `order`
        (then by `id`, so the order is stable across reloads).

        Entries whose CSS file is missing on disk are skipped — the
        registry should not reference non-existent files, but a
        stale entry must not break the palette.
        """
        registry = CoreEngineLibWordEffectsService._read_registry()

        result: List[dict] = []
        for item in registry.get("effects", []):
            effect_id = item.get("id")
            if not effect_id:
                continue

            # Skip entries whose CSS is missing in both trees.
            pkg_path = CoreEngineLibWordEffectsService._pkg_file_path(effect_id)
            static_path = CoreEngineLibWordEffectsService._static_file_path(effect_id)
            if not os.path.isfile(pkg_path) and not os.path.isfile(static_path):
                continue

            result.append({
                "id": effect_id,
                "label": item.get("label", effect_id),
                "hint": item.get("hint", ""),
                "file": item.get("file", f"{FX_SUBDIR}/{effect_id}.css"),
                "media": item.get("media", ""),
                "builtin": bool(item.get("builtin", False)),
                "order": int(item.get("order", 100)),
            })

        result.sort(key=lambda e: (e["order"], e["id"]))
        return result

    # ============================================
    # READ
    # ============================================

    @staticmethod
    def read_effect(module_name: str, effect_id: str) -> Optional[str]:
        """
        Return the CSS of the given effect, or None if not found.

        `module_name` is accepted for signature symmetry with
        save_effect, but is NOT used — effects are shared across
        modules.
        """
        CoreEngineLibWordEffectsService._validate_effect_id(effect_id)

        candidates = [
            CoreEngineLibWordEffectsService._pkg_file_path(effect_id),
            CoreEngineLibWordEffectsService._static_file_path(effect_id),
        ]

        for path in candidates:
            if os.path.isfile(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        return f.read()
                except OSError as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Не удалось прочитать {path}: {e}",
                    )

        return None

    # ============================================
    # WRITE (save existing)
    # ============================================

    @staticmethod
    def save_effect(module_name: str, effect_id: str, css: str) -> dict:
        """
        Write the CSS to the package tree and the static tree
        (atomically). `module_name` is accepted for signature symmetry
        but is NOT used — effects are shared across modules.
        """
        CoreEngineLibWordEffectsService._validate_effect_id(effect_id)
        css = CoreEngineLibWordEffectsService._sanitize_css(css)

        pkg_path = CoreEngineLibWordEffectsService._pkg_file_path(effect_id)
        static_path = CoreEngineLibWordEffectsService._static_file_path(effect_id)

        for path in (pkg_path, static_path):
            CoreEngineLibWordEffectsService._write_atomic(path, css)

        return {
            "effect_id": effect_id,
            "bytes": len(css.encode("utf-8")),
        }

    # ============================================
    # CREATE
    # ============================================

    @staticmethod
    def create_effect(
        module_name: str,
        effect_id: str,
        label: str,
        hint: str,
        css: str,
        media: str = "",
    ) -> dict:
        """
        Create a new effect:
          1. validate id;
          2. refuse if the id already exists (409);
          3. sanitize CSS;
          4. write the CSS file to package + static trees;
          5. append the entry to the registry and write it to both trees.

        `module_name` is accepted for signature symmetry but is NOT
        used — effects are shared across modules.

        Returns {"effect_id", "file", "bytes"}.
        """
        CoreEngineLibWordEffectsService._validate_effect_id(effect_id)

        if not label or not label.strip():
            raise HTTPException(status_code=400, detail="Пустой label")

        css = CoreEngineLibWordEffectsService._sanitize_css(css)

        # ---- Collision check ----
        registry = CoreEngineLibWordEffectsService._read_registry()
        for item in registry.get("effects", []):
            if item.get("id") == effect_id:
                raise HTTPException(
                    status_code=409,
                    detail=f"Эффект {effect_id} уже существует",
                )

        # ---- Write CSS to both trees ----
        pkg_path = CoreEngineLibWordEffectsService._pkg_file_path(effect_id)
        static_path = CoreEngineLibWordEffectsService._static_file_path(effect_id)
        for path in (pkg_path, static_path):
            CoreEngineLibWordEffectsService._write_atomic(path, css)

        # ---- Append to registry, write both trees ----
        order = CoreEngineLibWordEffectsService._next_order(registry)
        entry = {
            "id": effect_id,
            "label": label.strip(),
            "hint": (hint or "").strip(),
            "file": f"{FX_SUBDIR}/{effect_id}.css",
            "media": media or "",
            "builtin": False,
            "order": order,
        }
        registry.setdefault("effects", []).append(entry)
        CoreEngineLibWordEffectsService._write_registry(registry)

        return {
            "effect_id": effect_id,
            "file": entry["file"],
            "bytes": len(css.encode("utf-8")),
        }

    # ============================================
    # DELETE
    # ============================================

    @staticmethod
    def delete_effect(module_name: str, effect_id: str) -> dict:
        """
        Delete a custom effect:
          1. validate id;
          2. refuse if builtin=True (400);
          3. remove the entry from the registry;
          4. remove the CSS file from package + static trees;
          5. write the registry to both trees.

        `module_name` is accepted for signature symmetry but is NOT
        used — effects are shared across modules.

        Returns {"effect_id", "deleted_files"} — number of CSS files
        actually removed (0, 1, or 2 — package and static are counted
        separately).
        """
        CoreEngineLibWordEffectsService._validate_effect_id(effect_id)

        registry = CoreEngineLibWordEffectsService._read_registry()

        # ---- Find entry ----
        found_idx = -1
        found_item = None
        for idx, item in enumerate(registry.get("effects", [])):
            if item.get("id") == effect_id:
                found_idx = idx
                found_item = item
                break

        if found_idx < 0:
            raise HTTPException(
                status_code=404,
                detail=f"Эффект {effect_id} не найден",
            )

        if bool(found_item.get("builtin", False)):
            raise HTTPException(
                status_code=400,
                detail=f"Встроенный эффект {effect_id} нельзя удалить",
            )

        # ---- Remove from registry ----
        registry["effects"].pop(found_idx)
        CoreEngineLibWordEffectsService._write_registry(registry)

        # ---- Remove files ----
        deleted = 0
        for path in (
            CoreEngineLibWordEffectsService._pkg_file_path(effect_id),
            CoreEngineLibWordEffectsService._static_file_path(effect_id),
        ):
            if os.path.isfile(path):
                try:
                    os.remove(path)
                    deleted += 1
                except OSError as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Не удалось удалить {path}: {e}",
                    )

        return {
            "effect_id": effect_id,
            "deleted_files": deleted,
        }

    # ============================================
    # INTERNAL
    # ============================================

    @staticmethod
    def _next_order(registry: dict) -> int:
        """
        Return the next `order` value for a new effect.

        Uses max(existing orders) + 10, so new effects land at the end
        of the palette. If the registry is empty, returns 10.
        """
        max_order = 0
        for item in registry.get("effects", []):
            try:
                o = int(item.get("order", 0))
            except (TypeError, ValueError):
                o = 0
            if o > max_order:
                max_order = o
        return max_order + 10 if max_order else 10

    # ============================================
    # ATOMIC WRITE
    # ============================================

    @staticmethod
    def _write_atomic(path: str, content: str) -> None:
        """
        Write `content` to `path` atomically:
          1. ensure the directory exists;
          2. write to a temp file in the same directory;
          3. os.replace(temp, path).

        A partial file is never visible to a concurrent reader.
        """
        directory = os.path.dirname(path)
        os.makedirs(directory, exist_ok=True)

        tmp_fd, tmp_path = tempfile.mkstemp(
            prefix=os.path.basename(path) + ".",
            suffix=".tmp",
            dir=directory,
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp_path, path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise