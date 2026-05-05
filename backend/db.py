"""SQLite storage layer for persisting lecture pipeline results."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import aiosqlite

DB_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DB_DIR / "lectures.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS lectures (
    id                     TEXT PRIMARY KEY,
    title                  TEXT NOT NULL,
    filename               TEXT NOT NULL,
    transcript             TEXT,
    summary                TEXT,
    quiz                   TEXT,
    flashcards             TEXT,
    target_language        TEXT,
    transcription_language TEXT,
    created_at             TEXT DEFAULT (datetime('now')),
    updated_at             TEXT DEFAULT (datetime('now'))
);
"""


async def _get_db() -> aiosqlite.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute(_CREATE_TABLE)
    await db.commit()
    return db


async def init_db() -> None:
    db = await _get_db()
    await db.close()


def _title_from_filename(filename: str) -> str:
    return Path(filename).stem or filename


def _serialize(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


def _deserialize(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


def _row_to_dict(row: aiosqlite.Row, *, full: bool = False) -> dict[str, Any]:
    d = dict(row)
    quiz_raw = _deserialize(d.get("quiz"))
    flash_raw = _deserialize(d.get("flashcards"))
    result: dict[str, Any] = {
        "id": d["id"],
        "title": d["title"],
        "filename": d["filename"],
        "target_language": d.get("target_language"),
        "transcription_language": d.get("transcription_language"),
        "quiz_count": len(quiz_raw) if isinstance(quiz_raw, list) else 0,
        "flashcard_count": len(flash_raw) if isinstance(flash_raw, list) else 0,
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }
    if full:
        result["transcript"] = d.get("transcript")
        result["summary"] = _deserialize(d.get("summary"))
        result["quiz"] = quiz_raw
        result["flashcards"] = flash_raw
    return result


# ── CRUD ──────────────────────────────────────────────────────────────


async def save_lecture(pipeline_result: dict[str, Any]) -> str:
    """Persist a pipeline result and return its new UUID."""
    lecture_id = str(uuid.uuid4())
    meta = pipeline_result.get("meta", {})
    filename = meta.get("filename", "unknown")
    title = _title_from_filename(filename)

    db = await _get_db()
    try:
        await db.execute(
            """INSERT INTO lectures
               (id, title, filename, transcript, summary, quiz, flashcards,
                target_language, transcription_language)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                lecture_id,
                title,
                filename,
                pipeline_result.get("transcript"),
                _serialize(pipeline_result.get("summary")),
                _serialize(pipeline_result.get("quiz", [])),
                _serialize(pipeline_result.get("flashcards", [])),
                meta.get("target_language"),
                meta.get("transcription_language"),
            ),
        )
        await db.commit()
    finally:
        await db.close()
    return lecture_id


async def list_lectures() -> list[dict[str, Any]]:
    db = await _get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM lectures ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
    finally:
        await db.close()
    return [_row_to_dict(r) for r in rows]


async def get_lecture(lecture_id: str) -> dict[str, Any] | None:
    db = await _get_db()
    try:
        cursor = await db.execute("SELECT * FROM lectures WHERE id = ?", (lecture_id,))
        row = await cursor.fetchone()
    finally:
        await db.close()
    return _row_to_dict(row, full=True) if row else None


async def delete_lecture(lecture_id: str) -> bool:
    db = await _get_db()
    try:
        cursor = await db.execute("DELETE FROM lectures WHERE id = ?", (lecture_id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def rename_lecture(lecture_id: str, new_title: str) -> bool:
    db = await _get_db()
    try:
        cursor = await db.execute(
            "UPDATE lectures SET title = ?, updated_at = datetime('now') WHERE id = ?",
            (new_title, lecture_id),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def get_lectures_by_ids(ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    db = await _get_db()
    try:
        cursor = await db.execute(
            f"SELECT * FROM lectures WHERE id IN ({placeholders})", ids  # noqa: S608
        )
        rows = await cursor.fetchall()
    finally:
        await db.close()
    return [_row_to_dict(r, full=True) for r in rows]


async def update_lecture_quiz_flashcards(
    lecture_id: str,
    quiz: list[dict[str, Any]] | None = None,
    flashcards: list[dict[str, Any]] | None = None,
) -> bool:
    """Append new quiz/flashcard items to an existing lecture."""
    db = await _get_db()
    try:
        cursor = await db.execute("SELECT quiz, flashcards FROM lectures WHERE id = ?", (lecture_id,))
        row = await cursor.fetchone()
        if not row:
            return False
        existing = dict(row)

        if quiz is not None:
            existing_quiz = _deserialize(existing.get("quiz")) or []
            existing_quiz.extend(quiz)
            await db.execute(
                "UPDATE lectures SET quiz = ?, updated_at = datetime('now') WHERE id = ?",
                (_serialize(existing_quiz), lecture_id),
            )

        if flashcards is not None:
            existing_flash = _deserialize(existing.get("flashcards")) or []
            existing_flash.extend(flashcards)
            await db.execute(
                "UPDATE lectures SET flashcards = ?, updated_at = datetime('now') WHERE id = ?",
                (_serialize(existing_flash), lecture_id),
            )

        await db.commit()
        return True
    finally:
        await db.close()
