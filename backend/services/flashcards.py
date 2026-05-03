"""Generate leveled flashcards from transcript with Google Gemini."""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any

import google.generativeai as genai

from services.flashcards_mock import load_mock_cards_raw
from services.quiz import (
    _context_chars,
    _gemini_model_name,
    _is_quota_or_rate_limit,
    _retry_sleep_seconds,
    _strip_json_fence,
)


_DIFF_OK = frozenset({"easy", "medium", "hard"})


def _use_mock_flashcards() -> bool:
    return os.environ.get("USE_MOCK_FLASHCARDS", "").strip().lower() in ("1", "true", "yes", "on")


def _normalize_flashcards(items: list[Any], *, limit: int | None = 18) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        front = str(item.get("front", "")).strip()
        back = str(item.get("back", "")).strip()
        if not front or not back:
            continue
        diff = str(item.get("difficulty", "medium")).lower().strip()
        if diff not in _DIFF_OK:
            diff = "medium"
        normalized.append(
            {
                "front": front,
                "back": back,
                "difficulty": diff,
                "card_type": str(item.get("card_type") or ""),
            }
        )
    if limit is not None:
        return normalized[:limit]
    return normalized


def generate_flashcards_sync(transcript: str) -> list[dict]:
    if _use_mock_flashcards():
        raw = load_mock_cards_raw()
        if not raw:
            raise RuntimeError(
                "USE_MOCK_FLASHCARDS is set but frontend/mock-flashcards.json is missing or empty"
            )
        return _normalize_flashcards(raw, limit=None)

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")

    genai.configure(api_key=key)
    model_name = _gemini_model_name()
    model = genai.GenerativeModel(model_name)

    trimmed = transcript[: _context_chars()]
    prompt = f"""You are an educator. Based ONLY on the lecture transcript below, create flashcards grouped by difficulty.

Return ONLY valid JSON (no markdown fences) with this shape:
{{"cards":[{{"front":"...","back":"...","difficulty":"easy","card_type":"definition"}}]}}

Difficulty rules:
- easy: short definitions and key terminology. Front should feel like "What is X?" when appropriate.
- medium: concrete examples, analogies, or comparisons. Front should feel like "Give an example of X" or "How does X compare to Y?" when appropriate.
- hard: reasoning, application, or common mistakes. Front should feel like "Why does X happen?" or "Why is this wrong?" when appropriate.

card_type: one short snake_case label such as definition, terminology, example, comparison, reasoning, application, misconception.

Create about 4 easy, 4 medium, and 3 hard cards (adjust down if the transcript is very short). Stay faithful to the transcript; do not invent facts.

TRANSCRIPT:
{trimmed}
"""

    max_attempts = int(os.environ.get("GEMINI_FLASHCARDS_MAX_RETRIES", os.environ.get("GEMINI_QUIZ_MAX_RETRIES", "3")))
    max_attempts = max(1, min(max_attempts, 6))

    last_err: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            response = model.generate_content(prompt)
            raw_text = (response.text or "").strip()
            if not raw_text:
                raise ValueError("Gemini returned empty response")

            parsed = json.loads(_strip_json_fence(raw_text))
            cards = parsed.get("cards")
            if not isinstance(cards, list):
                raise ValueError("Gemini JSON missing cards array")

            return _normalize_flashcards(cards, limit=24)
        except (json.JSONDecodeError, ValueError):
            raise
        except BaseException as exc:
            last_err = exc
            if _is_quota_or_rate_limit(exc) and attempt < max_attempts - 1:
                time.sleep(_retry_sleep_seconds(exc, attempt))
                continue
            if _is_quota_or_rate_limit(exc):
                raise RuntimeError(
                    f"Gemini quota/rate limit ({model_name}) while generating flashcards. "
                    "Try USE_MOCK_FLASHCARDS=true for demos, or retry later."
                ) from exc
            raise

    if last_err is not None:
        raise last_err
    raise RuntimeError("Gemini flashcard generation failed")


async def generate_flashcards(transcript: str) -> list[dict]:
    return await asyncio.to_thread(generate_flashcards_sync, transcript)
