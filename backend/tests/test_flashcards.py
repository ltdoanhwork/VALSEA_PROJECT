"""Tests for Gemini flashcard generation."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from services import flashcards as fc_module


@pytest.mark.asyncio
async def test_generate_flashcards_async_delegates_to_sync() -> None:
    payload = [{"front": "Q", "back": "A", "difficulty": "easy", "card_type": "definition"}]
    with patch.object(fc_module, "generate_flashcards_sync", return_value=payload) as m:
        out = await fc_module.generate_flashcards("any")
    m.assert_called_once_with("any")
    assert out[0]["difficulty"] == "easy"


def test_generate_flashcards_sync_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("USE_MOCK_FLASHCARDS", raising=False)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        fc_module.generate_flashcards_sync("text")


def test_generate_flashcards_sync_normalizes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-for-test")
    fake_response = MagicMock()
    fake_response.text = json.dumps(
        {
            "cards": [
                {
                    "front": " F ",
                    "back": " B ",
                    "difficulty": "EASY",
                    "card_type": "definition",
                },
                {"bad": True},
            ]
        }
    )
    mock_model = MagicMock()
    mock_model.generate_content.return_value = fake_response

    with patch.object(fc_module.genai, "configure"), patch.object(
        fc_module.genai,
        "GenerativeModel",
        return_value=mock_model,
    ):
        out = fc_module.generate_flashcards_sync("lecture")

    assert len(out) == 1
    assert out[0]["front"] == "F"
    assert out[0]["back"] == "B"
    assert out[0]["difficulty"] == "easy"


def test_generate_flashcards_sync_use_mock_loads_pack(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USE_MOCK_FLASHCARDS", "true")
    out = fc_module.generate_flashcards_sync("ignored")
    assert len(out) >= 1
    assert all(x["difficulty"] in {"easy", "medium", "hard"} for x in out)
