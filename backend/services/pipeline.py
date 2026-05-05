"""Orchestrates transcribe → clarify → format + quiz → translate.

Large audio files are automatically split, transcribed in parallel,
and recombined before the rest of the pipeline runs.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from services.audio_splitter import AudioChunk, needs_splitting, split_audio
from services.clarify import clarify_text
from services.flashcards import generate_flashcards
from services.format_summary import format_key_quotes, format_transcript
from services.quiz import generate_quiz
from services.transcribe import transcribe_audio
from services.translate import translate_text

logger = logging.getLogger(__name__)

PARALLEL_TRANSCRIPTIONS = int(os.environ.get("PARALLEL_TRANSCRIPTIONS", "3"))


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


# ── Chunked parallel transcription ────────────────────────────────────


async def _transcribe_single(
    client: httpx.AsyncClient,
    chunk: AudioChunk,
    language: str,
) -> dict[str, Any]:
    """Transcribe one audio chunk via Valsea."""
    return await transcribe_audio(
        client,
        file_content=chunk.data,
        filename=chunk.filename,
        content_type="audio/mpeg",
        language=language,
    )


async def _transcribe_chunks_parallel(
    chunks: list[AudioChunk],
    language: str,
    report: ProgressCallback,
    concurrency: int = PARALLEL_TRANSCRIPTIONS,
) -> tuple[str, list[dict[str, Any]] | None]:
    """Transcribe all chunks with bounded concurrency, return combined text + tags."""
    results: list[dict[str, Any] | BaseException] = [{}] * len(chunks)
    sem = asyncio.Semaphore(concurrency)

    async def _worker(idx: int, chunk: AudioChunk) -> None:
        async with sem:
            await report(
                "transcribe",
                f"Transcribing chunk {idx + 1}/{len(chunks)} ({chunk.filename})…",
            )
            async with httpx.AsyncClient() as client:
                results[idx] = await _transcribe_single(client, chunk, language)

    tasks = [asyncio.create_task(_worker(i, c)) for i, c in enumerate(chunks)]

    errors: list[BaseException] = []
    for task in asyncio.as_completed(tasks):
        try:
            await task
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            errors.append(exc)
        except Exception as exc:
            errors.append(exc)

    if errors:
        first = errors[0]
        if isinstance(first, httpx.HTTPStatusError):
            detail = first.response.text or first.response.reason_phrase
            raise LecturePipelineError(
                first.response.status_code,
                f"Valsea transcription failed on chunk: {detail}",
            )
        if isinstance(first, httpx.RequestError):
            logger.warning("Valsea chunk transcription transport error: %s: %s", type(first).__name__, first)
            raise LecturePipelineError(
                502,
                _transport_failure_detail(first, step="Cannot reach Valsea (chunk transcription)"),
            )
        raise LecturePipelineError(500, f"Chunk transcription error: {first}")

    all_texts: list[str] = []
    all_tags: list[dict[str, Any]] = []

    for r in results:
        if not isinstance(r, dict):
            continue
        text = (r.get("raw_transcript") or "").strip() or (r.get("text") or "").strip()
        if text:
            all_texts.append(text)
        tags = r.get("semantic_tags")
        if isinstance(tags, list):
            for t in tags:
                if isinstance(t, dict):
                    all_tags.append(t)

    combined = "\n\n".join(all_texts)
    return combined, all_tags or None


# ── Main pipeline ─────────────────────────────────────────────────────


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

    # ── Step 1: Transcribe (auto-split if large) ──────────────────────

    if needs_splitting(file_content):
        await report(
            "splitting",
            f"Audio is {len(file_content) / 1_048_576:.1f} MB — splitting into chunks…",
        )
        try:
            chunks = await split_audio(file_content, filename, content_type)
        except RuntimeError as exc:
            raise LecturePipelineError(500, f"Audio split failed: {exc}") from exc

        await report(
            "transcribe",
            f"Transcribing {len(chunks)} chunks in parallel…",
        )
        raw_for_clarify, semantic_tags = await _transcribe_chunks_parallel(
            chunks, tl, report,
        )
    else:
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
        semantic_tags = _normalize_semantic_tags(tr.get("semantic_tags"))

    if not raw_for_clarify:
        raise LecturePipelineError(422, "Transcription returned empty text")

    # ── Step 2: Clarify ───────────────────────────────────────────────

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

    # ── Step 3: Format (3 types) + Quiz + Flashcards (parallel) ────────

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

    await report("summary_quiz", "Study notes (Valsea) + quiz + flashcards (Bedrock) in parallel…")

    async with httpx.AsyncClient() as client:
        try:
            key_quotes_en, overview_en, takeaways_en, quiz_items, flash_items = (
                await asyncio.gather(
                    format_transcript(
                        client,
                        transcript=clean_text,
                        output_type="key_quotes",
                        semantic_tags=semantic_tags,
                    ),
                    format_transcript(
                        client,
                        transcript=clean_text,
                        output_type="meeting_minutes",
                        semantic_tags=semantic_tags,
                    ),
                    format_transcript(
                        client,
                        transcript=clean_text,
                        output_type="action_items",
                        semantic_tags=semantic_tags,
                    ),
                    safe_quiz(),
                    safe_flashcards(),
                )
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

        # ── Step 4: Translate all sections in parallel ────────────────

        await report("translate", f"Translating study notes → {tgt}…")

        # Build glossary from semantic_tags (phrase → meaning, bilingual)
        glossary_en: list[dict[str, str]] = []
        if semantic_tags:
            seen: set[str] = set()
            for tag in semantic_tags:
                phrase = (tag.get("phrase") or "").strip()
                meaning = (tag.get("meaning") or "").strip()
                if phrase and phrase.lower() not in seen:
                    seen.add(phrase.lower())
                    glossary_en.append({"term": phrase, "meaning": meaning})

        glossary_translate_text = ""
        if glossary_en:
            glossary_translate_text = "\n".join(
                f"{g['term']} ||| {g['meaning']}" for g in glossary_en
            )

        async def _safe_translate(text: str) -> str:
            if not text.strip():
                return ""
            return await translate_text(client, text=text, target_language=tgt)

        try:
            texts_to_translate = [key_quotes_en, overview_en, takeaways_en]
            if glossary_translate_text:
                texts_to_translate.append(glossary_translate_text)

            translated = await asyncio.gather(
                *[_safe_translate(t) for t in texts_to_translate]
            )

            key_quotes_local = translated[0]
            overview_local = translated[1]
            takeaways_local = translated[2]
            glossary_local_raw = translated[3] if glossary_translate_text else ""
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

    # Merge glossary translations back into structured list
    glossary: list[dict[str, str]] = []
    if glossary_en:
        local_lines = glossary_local_raw.split("\n") if glossary_local_raw else []
        for idx, item in enumerate(glossary_en):
            entry: dict[str, str] = {
                "term": item["term"],
                "meaning": item["meaning"],
            }
            if idx < len(local_lines):
                parts = local_lines[idx].split("|||")
                entry["term_local"] = parts[0].strip() if parts else ""
                entry["meaning_local"] = parts[1].strip() if len(parts) > 1 else ""
            else:
                entry["term_local"] = ""
                entry["meaning_local"] = ""
            glossary.append(entry)

    # Flat backward-compat strings (concatenation of all sections)
    summary_en = key_quotes_en
    summary_local = key_quotes_local

    await report("done", "Finished.")

    return {
        "transcript": clean_text,
        "summary_en": summary_en,
        "summary_local": summary_local,
        "summary": {
            "glossary": glossary,
            "overview_en": overview_en,
            "overview_local": overview_local,
            "key_quotes_en": key_quotes_en,
            "key_quotes_local": key_quotes_local,
            "takeaways_en": takeaways_en,
            "takeaways_local": takeaways_local,
        },
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
