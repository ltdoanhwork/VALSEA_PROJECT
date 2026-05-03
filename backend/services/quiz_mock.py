"""Load mock quiz JSON shared with the frontend (`frontend/mock-quiz.json`)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent


def mock_quiz_path() -> Path:
    return ROOT / "frontend" / "mock-quiz.json"


def load_mock_questions_raw() -> list[dict[str, Any]]:
    path = mock_quiz_path()
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    questions = payload.get("questions")
    if not isinstance(questions, list):
        return []
    return [q for q in questions if isinstance(q, dict)]
