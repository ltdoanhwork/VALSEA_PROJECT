"""Clarify noisy transcripts via Valsea."""

from __future__ import annotations

import os

import httpx

VALSEA_BASE = "https://api.valsea.ai"


async def clarify_text(
    client: httpx.AsyncClient,
    *,
    text: str,
    language_hint: str | None = None,
) -> str:
    api_key = os.environ["VALSEA_API_KEY"]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict = {
        "model": "valsea-clarify",
        "text": text,
        "response_format": "json",
    }
    if language_hint:
        body["language"] = language_hint

    response = await client.post(
        f"{VALSEA_BASE}/v1/clarifications",
        headers=headers,
        json=body,
        timeout=httpx.Timeout(120.0, connect=30.0),
    )
    response.raise_for_status()
    payload = response.json()
    clarified = payload.get("clarified_text") or payload.get("text") or ""
    return str(clarified).strip()
