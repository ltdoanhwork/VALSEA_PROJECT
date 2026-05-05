"""Unit tests for format_summary helpers and HTTP wrapper."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from services.format_summary import (
    VALSEA_BASE,
    _extract_formatted_body,
    format_key_quotes,
    format_transcript,
)


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"key_quotes": "  point one  "}, "point one"),
        ({"formatted_text": "minutes"}, "minutes"),
        ({"meeting_minutes": "overview text"}, "overview text"),
        ({"action_items": "- do X"}, "- do X"),
        ({"data": {"text": "nested"}}, "nested"),
        ({"output_data": {"summary": "s"}}, "s"),
    ],
)
def test_extract_formatted_body(payload: dict, expected: str) -> None:
    assert _extract_formatted_body(payload) == expected


def test_extract_unknown_schema_json_dump() -> None:
    out = _extract_formatted_body({"unknown": [1, 2]})
    assert json.loads(out)["unknown"] == [1, 2]


@pytest.mark.asyncio
async def test_format_key_quotes_success(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/formatting").mock(
        return_value=httpx.Response(200, json={"formatted_text": "- Key idea"})
    )
    async with httpx.AsyncClient() as client:
        text = await format_key_quotes(client, transcript="long transcript", semantic_tags=None)
    assert text == "- Key idea"


@pytest.mark.asyncio
async def test_format_key_quotes_passes_semantic_tags(respx_mock: respx.MockRouter) -> None:
    captured: dict = {}

    def route(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"text": "ok"})

    respx_mock.post(f"{VALSEA_BASE}/v1/formatting").mock(side_effect=route)
    tags = [{"tag": "concept", "phrase": "x", "meaning": "y"}]
    async with httpx.AsyncClient() as client:
        await format_key_quotes(client, transcript="t", semantic_tags=tags)
    assert captured["body"]["semantic_tags"] == tags


@pytest.mark.asyncio
async def test_format_key_quotes_http_error(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/formatting").mock(return_value=httpx.Response(402, text="no credits"))
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError):
            await format_key_quotes(client, transcript="t")


@pytest.mark.asyncio
@pytest.mark.parametrize("output_type", ["meeting_minutes", "action_items", "key_quotes"])
async def test_format_transcript_sends_output_type(
    respx_mock: respx.MockRouter, output_type: str
) -> None:
    captured: dict = {}

    def route(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"formatted_text": "result"})

    respx_mock.post(f"{VALSEA_BASE}/v1/formatting").mock(side_effect=route)
    async with httpx.AsyncClient() as client:
        result = await format_transcript(client, transcript="text", output_type=output_type)
    assert captured["body"]["output_type"] == output_type
    assert result == "result"
