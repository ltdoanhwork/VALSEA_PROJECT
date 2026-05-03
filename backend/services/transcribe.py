"""Send lecture audio to Valsea transcription API."""

from __future__ import annotations

import os
from typing import Any

import httpx

VALSEA_BASE = "https://api.valsea.ai"


async def transcribe_audio(
    client: httpx.AsyncClient,
    *,
    file_content: bytes,
    filename: str,
    content_type: str | None,
    language: str,
) -> dict[str, Any]:
    api_key = os.environ["VALSEA_API_KEY"]
    headers = {"Authorization": f"Bearer {api_key}"}
    mime = content_type or "application/octet-stream"
    files = {"file": (filename, file_content, mime)}
    data = {
        "model": "valsea-transcribe",
        "language": language,
        "response_format": "verbose_json",
    }
    response = await client.post(
        f"{VALSEA_BASE}/v1/audio/transcriptions",
        headers=headers,
        files=files,
        data=data,
        timeout=httpx.Timeout(
            900.0,
            connect=120.0,
            read=900.0,
            write=900.0,
            pool=120.0,
        ),
    )
    response.raise_for_status()
    return response.json()
