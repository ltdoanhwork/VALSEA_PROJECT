"""Format transcript into English key quotes via Valsea."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

VALSEA_BASE = "https://api.valsea.ai"


def _extract_formatted_body(payload: dict[str, Any]) -> str:
    """Best-effort parse Valsea formatting responses."""
    for key in (
        "formatted_transcript",
        "formatted_text",
        "output",
        "content",
        "text",
        "result",
        "key_quotes",
        "summary",
    ):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    nested = payload.get("data") or payload.get("output_data")
    if isinstance(nested, dict):
        return _extract_formatted_body(nested)
    # Fallback: pretty-print unknown schema for UI/debugging
    return json.dumps(payload, indent=2, ensure_ascii=False)


async def format_key_quotes(
    client: httpx.AsyncClient,
    *,
    transcript: str,
    semantic_tags: list[dict[str, Any]] | None = None,
) -> str:
    api_key = os.environ["VALSEA_API_KEY"]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": "valsea-format",
        "transcript": transcript,
        "output_type": "key_quotes",
        "response_format": "verbose_json",
    }
    if semantic_tags:
        body["semantic_tags"] = semantic_tags

    response = await client.post(
        f"{VALSEA_BASE}/v1/formatting",
        headers=headers,
        json=body,
        timeout=httpx.Timeout(180.0, connect=30.0),
    )
    response.raise_for_status()
    payload = response.json()
    return _extract_formatted_body(payload)
