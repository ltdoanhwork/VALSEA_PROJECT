"""Generate quiz questions with Google Gemini."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from typing import Any

import google.generativeai as genai

from services.quiz_mock import load_mock_questions_raw

try:
    from google.api_core import exceptions as google_api_exceptions
except ImportError:
    google_api_exceptions = None


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _context_chars() -> int:
    raw = os.environ.get("GEMINI_QUIZ_CONTEXT_CHARS", "24000").strip()
    try:
        n = int(raw)
        return max(4000, min(n, 120_000))
    except ValueError:
        return 24_000


def _gemini_model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"


def _use_mock_quiz() -> bool:
    return os.environ.get("USE_MOCK_QUIZ", "").strip().lower() in ("1", "true", "yes", "on")


def _normalize_quiz_items(items: list[Any], *, limit: int | None = 5) -> list[dict[str, Any]]:
    sliced = items if limit is None else items[:limit]
    normalized: list[dict[str, Any]] = []
    for item in sliced:
        if not isinstance(item, dict):
            continue
        q = item.get("question", "")
        if not str(q).strip():
            continue
        opts = item.get("options") or {}
        ans = str(item.get("answer", "")).upper().strip()
        normalized.append(
            {
                "question": str(q),
                "options": {
                    "A": str(opts.get("A", "")),
                    "B": str(opts.get("B", "")),
                    "C": str(opts.get("C", "")),
                    "D": str(opts.get("D", "")),
                },
                "answer": ans if ans in {"A", "B", "C", "D"} else "A",
                "explain": str(item.get("explain") or ""),
            }
        )
    return normalized


def _is_quota_or_rate_limit(exc: BaseException) -> bool:
    if google_api_exceptions is not None and isinstance(exc, google_api_exceptions.ResourceExhausted):
        return True
    msg = str(exc).lower()
    return "429" in msg or "quota" in msg or "rate limit" in msg or "resource exhausted" in msg


def _retry_sleep_seconds(exc: BaseException, attempt: int) -> float:
    text = str(exc)
    m = re.search(r"retry in\s+([\d.]+)\s*s", text, re.I)
    if m:
        return min(float(m.group(1)) + 2.0, 120.0)
    m2 = re.search(r"seconds:\s*(\d+)", text)
    if m2:
        return min(float(m2.group(1)) + 2.0, 120.0)
    return min(8.0 * (attempt + 1), 45.0)


def generate_quiz_sync(transcript: str) -> list[dict]:
    if _use_mock_quiz():
        raw = load_mock_questions_raw()
        if not raw:
            raise RuntimeError("USE_MOCK_QUIZ is set but frontend/mock-quiz.json is missing or empty")
        return _normalize_quiz_items(raw, limit=None)

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")

    genai.configure(api_key=key)
    model_name = _gemini_model_name()
    model = genai.GenerativeModel(model_name)

    trimmed = transcript[: _context_chars()]
    prompt = f"""You are an educator. Based ONLY on the lecture transcript below, create exactly 5 multiple-choice questions testing concrete facts and concepts from the material.

Return ONLY valid JSON (no markdown fences) with this shape:
{{"questions":[{{"question":"...","options":{{"A":"...","B":"...","C":"...","D":"..."}},"answer":"A"}}]}}

Rules:
- answer must be exactly one of "A","B","C","D".
- Options must be mutually exclusive and plausible.
- Do not invent facts not supported by the transcript.

TRANSCRIPT:
{trimmed}
"""

    max_attempts = int(os.environ.get("GEMINI_QUIZ_MAX_RETRIES", "3"))
    max_attempts = max(1, min(max_attempts, 6))

    last_err: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            response = model.generate_content(prompt)
            raw_text = (response.text or "").strip()
            if not raw_text:
                raise ValueError("Gemini returned empty response")

            parsed = json.loads(_strip_json_fence(raw_text))
            questions = parsed.get("questions")
            if not isinstance(questions, list):
                raise ValueError("Gemini JSON missing questions array")

            return _normalize_quiz_items(questions, limit=5)
        except (json.JSONDecodeError, ValueError):
            raise
        except BaseException as exc:
            last_err = exc
            if _is_quota_or_rate_limit(exc) and attempt < max_attempts - 1:
                time.sleep(_retry_sleep_seconds(exc, attempt))
                continue
            if _is_quota_or_rate_limit(exc):
                raise RuntimeError(
                    f"Gemini quota/rate limit ({model_name}). "
                    "Wait and retry, shorten the lecture, enable billing in Google AI Studio, "
                    "or try GEMINI_MODEL=gemini-2.5-flash-lite (check model availability). "
                    "https://ai.google.dev/gemini-api/docs/rate-limits"
                ) from exc
            raise

    if last_err is not None:
        raise last_err
    raise RuntimeError("Gemini quiz generation failed")


async def generate_quiz(transcript: str) -> list[dict]:
    return await asyncio.to_thread(generate_quiz_sync, transcript)
