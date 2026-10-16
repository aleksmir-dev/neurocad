# neurocad/core/engine/lib/backup/s3.py

"""
Thin wrapper around rclone for S3 operations.

Namespace: CoreEngineLibBackupS3

Why rclone and not boto3:
    - rclone is already configured on the server (rclone.conf);
    - it works with any S3-compatible provider without code changes;
    - it handles retries, chunking, and multipart uploads.

All functions are async: rclone runs in a subprocess and the caller
awaits it. Failures raise RuntimeError with stderr attached.

Multi-instance / systemd note:
    Under systemd the process environment may be trimmed — PATH may
    not include /usr/bin, and HOME may be unset. rclone then can't
    find either the binary or ~/.config/rclone/rclone.conf.

    To make this robust we:
      - resolve the rclone binary once via shutil.which() with a
        /usr/bin fallback;
      - pass an explicit env to subprocess.exec with a full PATH
        and a HOME fallback.

    This way the same code works under systemd, in cron, in dev
    shells, and inside tests — without relying on the caller's
    environment.
"""

import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional


# ============================================
# CONSTANTS
# ============================================

#: Regex for backup archive filenames: neurocad_YYYYMMDD_HHMMSS.tar.gz
_ARCHIVE_RE = re.compile(r"^neurocad_\d{8}_\d{6}\.tar\.gz$")

#: Where to look for the rclone binary if `which` fails.
_RCLONE_FALLBACK = "/usr/bin/rclone"

#: System dirs that must be on PATH for rclone to find helpers
#: (getent, bash, git, etc.). Missing /usr/bin is the #1 cause of
#: "executable file not found" under systemd.
_SYSTEM_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

#: Default HOME if the environment does not provide one. rclone
#: reads ~/.config/rclone/rclone.conf, so this matters.
_DEFAULT_HOME = "/root"


# ============================================
# ENV / BINARY RESOLUTION
# ============================================

def _rclone_bin() -> str:
    """
    Absolute path to the rclone binary.

    Prefers whatever is on PATH (shutil.which), falls back to
    /usr/bin/rclone. Under systemd, PATH is often only the venv
    bin dir, so `which` returns None — the fallback then saves us.

    Returns the fallback path even if it does not exist, so the
    error message from subprocess is clear ("No such file or
    directory: /usr/bin/rclone") instead of a generic
    "command not found".
    """
    found: Optional[str] = shutil.which("rclone")
    if found:
        return found
    return _RCLONE_FALLBACK


def _rclone_env() -> Dict[str, str]:
    """
    Environment for the rclone subprocess.

    Guarantees:
      - PATH contains the standard system directories, so rclone
        can find getent/bash/git even when systemd trims PATH.
      - HOME is set, so rclone reads ~/.config/rclone/rclone.conf
        instead of falling back to CWD.

    Existing env is preserved — we only extend/repair the two
    variables that matter.
    """
    env = dict(os.environ)

    # PATH — ensure system dirs are present, keep whatever was
    # already there (venv bin, vscode helpers, etc.).
    current_path = env.get("PATH", "")
    parts = [p for p in current_path.split(":") if p]
    for p in _SYSTEM_PATH.split(":"):
        if p not in parts:
            parts.append(p)
    env["PATH"] = ":".join(parts)

    # HOME — fall back to /root when unset (typical for systemd
    # units that do not set HOME explicitly).
    if not env.get("HOME"):
        env["HOME"] = _DEFAULT_HOME

    return env


# ============================================
# INTERNAL
# ============================================

async def _run_rclone(*args: str) -> str:
    """
    Run `rclone` with the given arguments and return stdout.

    Raises RuntimeError on non-zero exit, with stderr attached.
    Raises RuntimeError (with a clear message) if the binary
    cannot be launched at all — e.g. rclone is not installed.
    """
    cmd = [_rclone_bin(), *args]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_rclone_env(),
        )
    except FileNotFoundError as e:
        # Binary itself is missing — this is a setup error, not
        # an rclone error. Give a clear message so the UI shows
        # something actionable instead of "No such file or directory".
        raise RuntimeError(
            f"rclone not found: tried {cmd[0]!r}. "
            f"Install rclone (apt install rclone) or set it on PATH. "
            f"[{type(e).__name__}: {e}]"
        ) from e
    except PermissionError as e:
        raise RuntimeError(
            f"rclone not executable: {cmd[0]!r}. "
            f"Check file permissions. "
            f"[{type(e).__name__}: {e}]"
        ) from e

    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        # Truncate very long stderr — it goes into backup_runs.error.
        if len(err) > 500:
            err = err[:497] + "..."
        raise RuntimeError(
            f"rclone failed (exit {proc.returncode}): {err}"
        )

    return stdout.decode("utf-8", errors="replace")


# ============================================
# PUBLIC
# ============================================

async def upload_file(
    local_path: Path,
    remote: str,
    bucket: str,
    level: str,
) -> None:
    """
    Upload one file to <remote>:<bucket>/<level>/.

    Uses `rclone copy` (not `sync`) — does not touch other files
    in the destination.
    """
    dst = f"{remote}:{bucket}/{level}/"
    await _run_rclone("copy", str(local_path), dst, "--no-traverse")


async def list_archives(
    remote: str,
    bucket: str,
    level: str,
) -> List[str]:
    """
    List archive filenames (neurocad_*.tar.gz) on <remote>:<bucket>/<level>/.

    Sorted ascending (oldest first) — matches the rotation logic:
    the first N entries are the oldest and should be deleted first.
    """
    dst = f"{remote}:{bucket}/{level}/"
    out = await _run_rclone("lsf", dst, "--files-only")

    files = [line.strip() for line in out.splitlines() if line.strip()]
    archives = [f for f in files if _ARCHIVE_RE.match(f)]
    archives.sort()
    return archives


async def delete_file(
    remote: str,
    bucket: str,
    level: str,
    filename: str,
) -> None:
    """
    Delete one file from <remote>:<bucket>/<level>/<filename>.

    Raises on failure. Callers that do not care about missing files
    (e.g. the paired .db.dump for an old archive) should catch and
    ignore.
    """
    dst = f"{remote}:{bucket}/{level}/{filename}"
    await _run_rclone("deletefile", dst)