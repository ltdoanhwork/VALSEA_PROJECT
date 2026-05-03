"""Translate text via Valsea."""

from __future__ import annotations

import os

import httpx

VALSEA_BASE = "https://api.valsea.ai"


async def translate_text(
    client: httpx.AsyncClient,
    *,
    text: str,
    target_language: str,
) -> str:
    api_key = os.environ["VALSEA_API_KEY"]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "valsea-translate",
        "text": text,
        "source": "auto",
        "target": target_language,
        "response_format": "json",
    }
    response = await client.post(
        f"{VALSEA_BASE}/v1/translations",
        headers=headers,
        json=body,
        timeout=httpx.Timeout(120.0, connect=30.0),
    )
    response.raise_for_status()
    payload = response.json()
    translated = payload.get("translated_text") or ""
    return str(translated).strip()
