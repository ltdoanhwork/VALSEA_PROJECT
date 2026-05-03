"""Shared pytest fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VALSEA_API_KEY", "vl_test_fake_key_unit_tests_only")
    monkeypatch.setenv("GEMINI_API_KEY", "fake_gemini_api_key_unit_tests_only")
