"""Tests for Valsea clarification client."""

from __future__ import annotations

import httpx
import pytest
import respx

from services.clarify import VALSEA_BASE, clarify_text


@pytest.mark.asyncio
async def test_clarify_success(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/clarifications").mock(
        return_value=httpx.Response(200, json={"clarified_text": "Clear sentence."})
    )
    async with httpx.AsyncClient() as client:
        out = await clarify_text(client, text="noisy stuff")
    assert out == "Clear sentence."


@pytest.mark.asyncio
async def test_clarify_fallback_text_field(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/clarifications").mock(
        return_value=httpx.Response(200, json={"text": "fallback"})
    )
    async with httpx.AsyncClient() as client:
        out = await clarify_text(client, text="raw")
    assert out == "fallback"


@pytest.mark.asyncio
async def test_clarify_language_hint(respx_mock: respx.MockRouter) -> None:
    import json as json_lib

    seen: dict = {}

    def route(request: httpx.Request) -> httpx.Response:
        seen["json"] = json_lib.loads(request.content.decode())
        return httpx.Response(200, json={"clarified_text": "ok"})

    respx_mock.post(f"{VALSEA_BASE}/v1/clarifications").mock(side_effect=route)
    async with httpx.AsyncClient() as client:
        await clarify_text(client, text="lah", language_hint="singlish")
    assert seen["json"]["language"] == "singlish"


@pytest.mark.asyncio
async def test_clarify_http_error(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/clarifications").mock(return_value=httpx.Response(401))
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError):
            await clarify_text(client, text="x")
