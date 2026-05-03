"""Tests for Valsea transcription client."""

from __future__ import annotations

import httpx
import pytest
import respx

from services.transcribe import VALSEA_BASE, transcribe_audio


@pytest.mark.asyncio
async def test_transcribe_success(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/audio/transcriptions").mock(
        return_value=httpx.Response(
            200,
            json={
                "text": "Hello class.",
                "raw_transcript": "hello class",
                "semantic_tags": [],
            },
        )
    )
    async with httpx.AsyncClient() as client:
        out = await transcribe_audio(
            client,
            file_content=b"\x00\x01",
            filename="lesson.wav",
            content_type="audio/wav",
            language="english",
        )
    assert out["text"] == "Hello class."


@pytest.mark.asyncio
async def test_transcribe_posts_multipart_fields(respx_mock: respx.MockRouter) -> None:
    last: dict = {}

    def recorder(request: httpx.Request) -> httpx.Response:
        last["headers"] = dict(request.headers)
        return httpx.Response(200, json={"text": "x"})

    respx_mock.post(f"{VALSEA_BASE}/v1/audio/transcriptions").mock(side_effect=recorder)
    async with httpx.AsyncClient() as client:
        await transcribe_audio(
            client,
            file_content=b"pcm",
            filename="a.mp3",
            content_type="audio/mpeg",
            language="vietnamese",
        )
    assert "multipart/form-data" in last["headers"].get("content-type", "")


@pytest.mark.asyncio
async def test_transcribe_http_error(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/audio/transcriptions").mock(
        return_value=httpx.Response(413, text="too large")
    )
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError):
            await transcribe_audio(
                client,
                file_content=b"x",
                filename="big.wav",
                content_type=None,
                language="english",
            )


@pytest.mark.asyncio
async def test_transcribe_connect_error(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/audio/transcriptions").mock(
        side_effect=httpx.ConnectError("offline")
    )
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.RequestError):
            await transcribe_audio(
                client,
                file_content=b"x",
                filename="x.wav",
                content_type="audio/wav",
                language="english",
            )
