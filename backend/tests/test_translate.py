"""Tests for Valsea translation client."""

from __future__ import annotations

import httpx
import pytest
import respx

from services.translate import VALSEA_BASE, translate_text


@pytest.mark.asyncio
async def test_translate_success(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/translations").mock(
        return_value=httpx.Response(200, json={"translated_text": "Xin chào"})
    )
    async with httpx.AsyncClient() as client:
        out = await translate_text(client, text="Hello", target_language="vietnamese")
    assert out == "Xin chào"


@pytest.mark.asyncio
async def test_translate_http_error(respx_mock: respx.MockRouter) -> None:
    respx_mock.post(f"{VALSEA_BASE}/v1/translations").mock(return_value=httpx.Response(402))
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError):
            await translate_text(client, text="a", target_language="thai")
