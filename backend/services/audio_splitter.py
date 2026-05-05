"""Split large audio files into chunks using ffmpeg."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_CHUNK_BYTES = int(os.environ.get("SPLIT_MAX_CHUNK_BYTES", str(8 * 1024 * 1024)))
CHUNK_DURATION_SECS = int(os.environ.get("SPLIT_CHUNK_DURATION_SECS", "270"))


@dataclass(frozen=True)
class AudioChunk:
    index: int
    data: bytes
    filename: str


def needs_splitting(file_content: bytes) -> bool:
    return len(file_content) > MAX_CHUNK_BYTES


def _guess_extension(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower()
    if ext in (".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma", ".webm", ".mp4"):
        return ext
    mime_map = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        "audio/webm": ".webm",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
    }
    if content_type:
        mapped = mime_map.get(content_type.split(";")[0].strip().lower())
        if mapped:
            return mapped
    return ".mp3"


async def split_audio(
    file_content: bytes,
    filename: str,
    content_type: str | None = None,
    *,
    chunk_duration: int | None = None,
) -> list[AudioChunk]:
    """Split audio into ≤chunk_duration-second MP3 segments via ffmpeg.

    Returns a list of AudioChunk sorted by index.  If the file is small
    enough (≤ MAX_CHUNK_BYTES) or ffmpeg produces only one segment, returns
    a single-element list wrapping the original bytes.
    """
    duration = chunk_duration or CHUNK_DURATION_SECS
    ext = _guess_extension(filename, content_type)
    raw_stem = Path(filename).stem or "audio"
    # Sanitise stem: ffmpeg's segment muxer treats '%' as a format specifier,
    # and other special chars can break shell-like expansions on some platforms.
    stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in raw_stem) or "audio"

    tmpdir = tempfile.mkdtemp(prefix="l2q_split_")
    try:
        src = os.path.join(tmpdir, f"source{ext}")
        with open(src, "wb") as f:
            f.write(file_content)

        out_pattern = os.path.join(tmpdir, f"{stem}_part%03d.mp3")

        cmd = [
            "ffmpeg", "-y", "-i", src,
            "-f", "segment",
            "-segment_time", str(duration),
            "-vn",                # drop video track
            "-acodec", "libmp3lame",
            "-q:a", "4",         # VBR ~165 kbps — good quality, small size
            out_pattern,
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg split failed (exit {proc.returncode}): {stderr.decode(errors='replace')[:500]}"
            )

        parts = sorted(Path(tmpdir).glob(f"{stem}_part*.mp3"))
        if not parts:
            raise RuntimeError("ffmpeg produced no output segments")

        chunks: list[AudioChunk] = []
        for idx, part_path in enumerate(parts):
            data = part_path.read_bytes()
            chunks.append(AudioChunk(
                index=idx,
                data=data,
                filename=f"{stem}_part{idx:03d}.mp3",
            ))

        logger.info(
            "Split %s (%d bytes) into %d chunks of ~%ds each",
            filename, len(file_content), len(chunks), duration,
        )
        return chunks

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
