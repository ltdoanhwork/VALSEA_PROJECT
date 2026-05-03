"""Orchestrates transcribe → clarify → format + quiz → translate."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from services.clarify import clarify_text
from services.flashcards import generate_flashcards
from services.format_summary import format_key_quotes
from services.quiz import generate_quiz
from services.transcribe import transcribe_audio
from services.translate import translate_text

logger = logging.getLogger(__name__)


class LecturePipelineError(Exception):
    """Maps to HTTP errors from FastAPI handlers."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


ProgressCallback = Callable[[str, str], Awaitable[None]]


def _transport_failure_detail(exc: httpx.RequestError, *, step: str) -> str:
    name = type(exc).__name__
    extra = ""
    if name == "ReadError":
        extra = (
            " ReadError often means the connection dropped during upload or while reading the response — "
            "try a smaller/shorter audio file (under 10 MB), extract audio from MP4 with ffmpeg, "
            "or temporarily disable VPN/proxy."
        )
    return (
        f"{step} ({name}): {exc}.{extra} "
        "Check network/VPN/firewall/DNS; verify TLS with: "
        "curl -sS -o /dev/null -w '%{http_code}\\n' -X POST https://api.valsea.ai/v1/audio/transcriptions "
        "(expect 401 without API key). Full multipart test with a tiny WAV — see README \"Smoke test Valsea\"."
    )


async def _noop_progress(_phase: str, _label: str) -> None:
    pass


def _normalize_semantic_tags(raw: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list) or not raw:
        return None
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out or None


async def run_lecture_pipeline(
    *,
    file_content: bytes,
    filename: str,
    content_type: str | None,
    target_language: str,
    transcription_language: str,
    progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    report = progress or _noop_progress

    if not os.environ.get("VALSEA_API_KEY", "").strip():
        raise LecturePipelineError(500, "VALSEA_API_KEY is not configured")

    if not file_content:
        raise LecturePipelineError(400, "Empty audio file")

    tl = transcription_language.strip().lower()
    tgt = target_language.strip().lower()

    await report("transcribe", "Transcribing audio with Valsea…")

    async with httpx.AsyncClient() as client:
        try:
            tr = await transcribe_audio(
                client,
                file_content=file_content,
                filename=filename,
                content_type=content_type,
                language=tl,
            )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise LecturePipelineError(
                exc.response.status_code,
                f"Valsea transcription failed: {detail}",
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Valsea transcription transport error: %s: %s", type(exc).__name__, exc)
            raise LecturePipelineError(
                502,
                _transport_failure_detail(exc, step="Cannot reach Valsea (transcription)"),
            ) from exc

    raw_for_clarify = (
        (tr.get("raw_transcript") or "").strip()
        or (tr.get("text") or "").strip()
    )
    if not raw_for_clarify:
        raise LecturePipelineError(422, "Transcription returned empty text")

    semantic_tags = _normalize_semantic_tags(tr.get("semantic_tags"))

    await report("clarify", "Clarifying transcript…")

    async with httpx.AsyncClient() as client:
        try:
            clean_text = await clarify_text(client, text=raw_for_clarify)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise LecturePipelineError(
                exc.response.status_code,
                f"Valsea clarification failed: {detail}",
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Valsea clarify transport error: %s: %s", type(exc).__name__, exc)
            raise LecturePipelineError(
                502,
                _transport_failure_detail(exc, step="Cannot reach Valsea (clarify)"),
            ) from exc

    if not clean_text:
        clean_text = raw_for_clarify

    quiz_error: str | None = None
    flashcards_error: str | None = None

    async def safe_quiz() -> list[dict[str, Any]]:
        nonlocal quiz_error
        try:
            return await generate_quiz(clean_text)
        except Exception as exc:  # noqa: BLE001
            quiz_error = str(exc)
            return []

    async def safe_flashcards() -> list[dict[str, Any]]:
        nonlocal flashcards_error
        try:
            return await generate_flashcards(clean_text)
        except Exception as exc:  # noqa: BLE001
            flashcards_error = str(exc)
            return []

    await report("summary_quiz", "Key quotes (Valsea) + quiz + flashcards (Gemini) in parallel…")

    async with httpx.AsyncClient() as client:
        try:
            summary_en, quiz_items, flash_items = await asyncio.gather(
                format_key_quotes(
                    client,
                    transcript=clean_text,
                    semantic_tags=semantic_tags,
                ),
                safe_quiz(),
                safe_flashcards(),
            )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise LecturePipelineError(
                exc.response.status_code,
                f"Valsea formatting failed: {detail}",
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Valsea format transport error: %s: %s", type(exc).__name__, exc)
            raise LecturePipelineError(
                502,
                _transport_failure_detail(exc, step="Cannot reach Valsea (formatting)"),
            ) from exc

        await report("translate", f"Translating summary → {tgt}…")

        summary_local = ""
        try:
            if summary_en.strip():
                summary_local = await translate_text(
                    client,
                    text=summary_en,
                    target_language=tgt,
                )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise LecturePipelineError(
                exc.response.status_code,
                f"Valsea translation failed: {detail}",
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Valsea translate transport error: %s: %s", type(exc).__name__, exc)
            raise LecturePipelineError(
                502,
                _transport_failure_detail(exc, step="Cannot reach Valsea (translate)"),
            ) from exc

    await report("done", "Finished.")

    return {
        "transcript": clean_text,
        "summary_en": summary_en,
        "summary_local": summary_local,
        "quiz": quiz_items,
        "quiz_error": quiz_error,
        "flashcards": flash_items,
        "flashcards_error": flashcards_error,
        "meta": {
            "filename": filename,
            "target_language": target_language,
            "transcription_language": transcription_language,
        },
    }
