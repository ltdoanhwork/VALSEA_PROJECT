"""Tests for Bedrock flashcard generation."""

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


def test_generate_flashcards_sync_normalizes() -> None:
    bedrock_response = {
        "output": {
            "message": {
                "content": [
                    {
                        "text": json.dumps(
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
                    }
                ]
            }
        }
    }
    mock_client = MagicMock()
    mock_client.converse.return_value = bedrock_response

    with patch.object(fc_module, "_bedrock_client", return_value=mock_client):
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
