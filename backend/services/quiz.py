"""Generate quiz questions with AWS Bedrock."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

from services.quiz_mock import load_mock_questions_raw


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _context_chars() -> int:
    raw = os.environ.get("BEDROCK_CONTEXT_CHARS", "24000").strip()
    try:
        n = int(raw)
        return max(4000, min(n, 120_000))
    except ValueError:
        return 24_000


def _bedrock_model_id() -> str:
    return (
        os.environ.get("BEDROCK_MODEL", "anthropic.claude-3-5-haiku-20241022-v1:0").strip()
        or "anthropic.claude-3-5-haiku-20241022-v1:0"
    )


def _bedrock_region() -> str:
    return (
        os.environ.get("BEDROCK_REGION", "")
        or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
    ).strip() or "us-east-1"


def _bedrock_client():
    return boto3.client("bedrock-runtime", region_name=_bedrock_region())


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


def _is_throttle_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        return code in (
            "ThrottlingException",
            "TooManyRequestsException",
            "ServiceQuotaExceededException",
            "ModelTimeoutException",
        )
    msg = str(exc).lower()
    return "throttl" in msg or "too many requests" in msg or "rate" in msg


def _retry_sleep_seconds(exc: BaseException, attempt: int) -> float:
    text = str(exc)
    m = re.search(r"retry in\s+([\d.]+)\s*s", text, re.I)
    if m:
        return min(float(m.group(1)) + 2.0, 120.0)
    m2 = re.search(r"seconds:\s*(\d+)", text)
    if m2:
        return min(float(m2.group(1)) + 2.0, 120.0)
    return min(8.0 * (attempt + 1), 45.0)


def _bedrock_generate(client, model_id: str, prompt: str) -> str:
    """Call Bedrock Converse API and return the assistant text."""
    response = client.converse(
        modelId=model_id,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 4096, "temperature": 0.3},
    )
    blocks = response["output"]["message"]["content"]
    return blocks[0]["text"] if blocks else ""


def generate_quiz_sync(transcript: str) -> list[dict]:
    if _use_mock_quiz():
        raw = load_mock_questions_raw()
        if not raw:
            raise RuntimeError("USE_MOCK_QUIZ is set but frontend/mock-quiz.json is missing or empty")
        return _normalize_quiz_items(raw, limit=None)

    model_id = _bedrock_model_id()
    client = _bedrock_client()

    trimmed = transcript[: _context_chars()]
    prompt = f"""You are an educator. Based ONLY on the lecture transcript below, create exactly 5 multiple-choice questions testing concrete facts and concepts from the material.

Return ONLY valid JSON (no markdown fences) with this shape:
{{"questions":[{{"question":"...","options":{{"A":"...","B":"...","C":"...","D":"..."}},"answer":"A","explain":"One sentence explaining why this answer is correct."}}]}}

Rules:
- answer must be exactly one of "A","B","C","D".
- explain: a brief, clear explanation (1-2 sentences) of why the correct answer is right. Reference the lecture content.
- Options must be mutually exclusive and plausible.
- Do not invent facts not supported by the transcript.

TRANSCRIPT:
{trimmed}
"""

    max_attempts = int(os.environ.get("BEDROCK_QUIZ_MAX_RETRIES", "3"))
    max_attempts = max(1, min(max_attempts, 6))

    last_err: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            raw_text = _bedrock_generate(client, model_id, prompt).strip()
            if not raw_text:
                raise ValueError("Bedrock returned empty response")

            parsed = json.loads(_strip_json_fence(raw_text))
            questions = parsed.get("questions")
            if not isinstance(questions, list):
                raise ValueError("Bedrock JSON missing questions array")

            return _normalize_quiz_items(questions, limit=5)
        except (json.JSONDecodeError, ValueError):
            raise
        except BaseException as exc:
            last_err = exc
            if _is_throttle_error(exc) and attempt < max_attempts - 1:
                time.sleep(_retry_sleep_seconds(exc, attempt))
                continue
            if _is_throttle_error(exc):
                raise RuntimeError(
                    f"Bedrock throttled ({model_id}). "
                    "Wait and retry, shorten the lecture, or check your AWS Bedrock service quotas. "
                    "https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html"
                ) from exc
            raise

    if last_err is not None:
        raise last_err
    raise RuntimeError("Bedrock quiz generation failed")


async def generate_quiz(transcript: str) -> list[dict]:
    return await asyncio.to_thread(generate_quiz_sync, transcript)
