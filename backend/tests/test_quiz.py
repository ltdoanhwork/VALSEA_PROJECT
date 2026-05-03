"""Tests for Gemini quiz generation."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from services import quiz as quiz_module


def test_strip_json_fence_via_parse() -> None:
    raw = quiz_module._strip_json_fence('```json\n{"x":1}\n```')
    assert json.loads(raw)["x"] == 1


@pytest.mark.asyncio
async def test_generate_quiz_async_delegates_to_sync() -> None:
    payload = {
        "questions": [
            {
                "question": "Q?",
                "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                "answer": "C",
            }
        ]
    }
    with patch.object(quiz_module, "generate_quiz_sync", return_value=payload["questions"]) as m:
        out = await quiz_module.generate_quiz("any transcript")
    m.assert_called_once_with("any transcript")
    assert out[0]["answer"] == "C"


def test_generate_quiz_sync_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        quiz_module.generate_quiz_sync("text")


def test_generate_quiz_sync_normalizes_questions() -> None:
    fake_response = MagicMock()
    fake_response.text = json.dumps(
        {
            "questions": [
                {
                    "question": "One?",
                    "options": {"A": "a", "B": "b", "C": "c", "D": "d"},
                    "answer": "b",
                },
                {"bad": True},
            ]
        }
    )
    mock_model = MagicMock()
    mock_model.generate_content.return_value = fake_response

    with patch.object(quiz_module.genai, "configure"), patch.object(
        quiz_module.genai,
        "GenerativeModel",
        return_value=mock_model,
    ):
        out = quiz_module.generate_quiz_sync("lecture body")

    assert len(out) == 1
    assert out[0]["question"] == "One?"
    assert out[0]["answer"] == "B"
    assert "explain" in out[0]


def test_generate_quiz_sync_use_mock_loads_frontend_pack(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USE_MOCK_QUIZ", "true")
    out = quiz_module.generate_quiz_sync("ignored transcript")
    assert len(out) >= 1
    assert all(isinstance(x.get("explain"), str) for x in out)
    assert all(x.get("answer") in {"A", "B", "C", "D"} for x in out)


def test_generate_quiz_sync_invalid_json_raises() -> None:
    fake_response = MagicMock()
    fake_response.text = "not json"
    mock_model = MagicMock()
    mock_model.generate_content.return_value = fake_response

    with patch.object(quiz_module.genai, "configure"), patch.object(
        quiz_module.genai,
        "GenerativeModel",
        return_value=mock_model,
    ):
        with pytest.raises(json.JSONDecodeError):
            quiz_module.generate_quiz_sync("t")
