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
"""

import asyncio
import re
from pathlib import Path
from typing import List


# ============================================
# CONSTANTS
# ============================================

#: Regex for backup archive filenames: neurocad_YYYYMMDD_HHMMSS.tar.gz
_ARCHIVE_RE = re.compile(r"^neurocad_\d{8}_\d{6}\.tar\.gz$")


# ============================================
# INTERNAL
# ============================================

async def _run_rclone(*args: str) -> str:
    """
    Run `rclone` with the given arguments and return stdout.

    Raises RuntimeError on non-zero exit, with stderr attached.
    """
    cmd = ["rclone", *args]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
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