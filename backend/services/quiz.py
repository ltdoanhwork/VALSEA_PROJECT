"""Generate quiz questions with Google Gemini."""

from __future__ import annotations

import asyncio
import json
import os
import re

import google.generativeai as genai


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def generate_quiz_sync(transcript: str) -> list[dict]:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")

    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    trimmed = transcript[:120_000]
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

    response = model.generate_content(prompt)
    raw_text = (response.text or "").strip()
    if not raw_text:
        raise ValueError("Gemini returned empty response")

    parsed = json.loads(_strip_json_fence(raw_text))
    questions = parsed.get("questions")
    if not isinstance(questions, list):
        raise ValueError("Gemini JSON missing questions array")

    normalized: list[dict] = []
    for item in questions[:5]:
        if not isinstance(item, dict):
            continue
        q = item.get("question", "")
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
            }
        )
    return normalized


async def generate_quiz(transcript: str) -> list[dict]:
    return await asyncio.to_thread(generate_quiz_sync, transcript)
