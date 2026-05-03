"""Load mock flashcard JSON (`frontend/mock-flashcards.json`)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent


def mock_flashcards_path() -> Path:
    return ROOT / "frontend" / "mock-flashcards.json"


def load_mock_cards_raw() -> list[dict[str, Any]]:
    path = mock_flashcards_path()
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    cards = payload.get("cards")
    if not isinstance(cards, list):
        return []
    return [c for c in cards if isinstance(c, dict)]
