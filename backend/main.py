"""Lecture2Quiz SEA — FastAPI backend."""

from __future__ import annotations

import asyncio
import json
import random
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import (
    delete_lecture,
    get_lecture,
    get_lectures_by_ids,
    init_db,
    list_lectures,
    rename_lecture,
    save_lecture,
    update_lecture_quiz_flashcards,
)
from services.flashcards import generate_flashcards
from services.pipeline import LecturePipelineError, run_lecture_pipeline
from services.quiz import generate_quiz
from services.translate import translate_text

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=False)

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Lecture2Quiz SEA", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


class TranslateBatchRequest(BaseModel):
    texts: list[str]
    target_language: str


@app.post("/translate")
async def translate_batch_endpoint(req: TranslateBatchRequest):
    """Translate an array of texts to target_language via Valsea (parallel, bounded)."""
    if not req.texts:
        return {"translations": []}

    sem = asyncio.Semaphore(5)

    async with httpx.AsyncClient() as client:

        async def _one(text: str) -> str:
            if not text.strip():
                return ""
            async with sem:
                return await translate_text(
                    client, text=text, target_language=req.target_language
                )

        results = await asyncio.gather(*[_one(t) for t in req.texts])

    return {"translations": list(results)}


@app.post("/transcribe-voice")
async def transcribe_voice(
    audio: UploadFile = File(...),
    language: str = Form("english"),
):
    """Transcribe a short voice recording for flashcard voice recall."""
    from services.transcribe import transcribe_audio as _transcribe

    data = await audio.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Audio too large (max 10 MB)")

    async with httpx.AsyncClient(timeout=30) as client:
        result = await _transcribe(
            client,
            file_content=data,
            filename=audio.filename or "voice.webm",
            content_type=audio.content_type,
            language=language,
        )
    return {"text": result.get("text", result.get("raw_transcript", ""))}


def _truthy_stream(raw: str) -> bool:
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@app.post("/process")
async def process_lecture(
    audio: UploadFile = File(...),
    target_language: str = Form("vietnamese"),
    transcription_language: str = Form("english"),
    stream: str = Form("false"),
):
    content = await audio.read()
    filename = audio.filename or "lecture.wav"
    content_type = audio.content_type

    if _truthy_stream(stream):

        async def event_gen():
            queue: asyncio.Queue[str | None] = asyncio.Queue()

            async def emit_phase(phase: str, label: str) -> None:
                payload = json.dumps(
                    {"type": "phase", "phase": phase, "label": label},
                    ensure_ascii=False,
                )
                await queue.put(payload)

            async def runner() -> None:
                try:
                    result = await run_lecture_pipeline(
                        file_content=content,
                        filename=filename,
                        content_type=content_type,
                        target_language=target_language,
                        transcription_language=transcription_language,
                        progress=emit_phase,
                    )
                    lecture_id = await save_lecture(result)
                    result["lecture_id"] = lecture_id
                    await queue.put(
                        json.dumps({"type": "complete", "payload": result}, ensure_ascii=False)
                    )
                except LecturePipelineError as exc:
                    await queue.put(
                        json.dumps(
                            {"type": "error", "status": exc.status_code, "detail": exc.detail},
                            ensure_ascii=False,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    await queue.put(
                        json.dumps(
                            {"type": "error", "status": 500, "detail": str(exc)},
                            ensure_ascii=False,
                        )
                    )
                finally:
                    await queue.put(None)

            task = asyncio.create_task(runner())
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {item}\n\n".encode("utf-8")
            await task

        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = await run_lecture_pipeline(
            file_content=content,
            filename=filename,
            content_type=content_type,
            target_language=target_language,
            transcription_language=transcription_language,
            progress=None,
        )
        lecture_id = await save_lecture(result)
        result["lecture_id"] = lecture_id
        return result
    except LecturePipelineError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


# ── Lecture library endpoints ─────────────────────────────────────────


@app.get("/lectures")
async def list_lectures_endpoint():
    return await list_lectures()


@app.get("/lectures/{lecture_id}")
async def get_lecture_endpoint(lecture_id: str):
    lecture = await get_lecture(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


@app.delete("/lectures/{lecture_id}")
async def delete_lecture_endpoint(lecture_id: str):
    deleted = await delete_lecture(lecture_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return {"ok": True}


class RenameRequest(BaseModel):
    title: str


@app.patch("/lectures/{lecture_id}")
async def rename_lecture_endpoint(lecture_id: str, req: RenameRequest):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    updated = await rename_lecture(lecture_id, req.title.strip())
    if not updated:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return {"ok": True}


class CombineRequest(BaseModel):
    lecture_ids: list[str]
    include_quiz: bool = True
    include_flashcards: bool = True


@app.post("/lectures/combine")
async def combine_lectures_endpoint(req: CombineRequest):
    if not req.lecture_ids:
        raise HTTPException(status_code=400, detail="No lecture IDs provided")
    lectures = await get_lectures_by_ids(req.lecture_ids)
    if not lectures:
        raise HTTPException(status_code=404, detail="No lectures found")

    combined_quiz: list[dict[str, Any]] = []
    combined_flashcards: list[dict[str, Any]] = []
    source_lectures: list[dict[str, str]] = []

    for lec in lectures:
        source_lectures.append({"id": lec["id"], "title": lec["title"]})
        if req.include_quiz and lec.get("quiz"):
            for q in lec["quiz"]:
                combined_quiz.append({**q, "_source_lecture": lec["title"]})
        if req.include_flashcards and lec.get("flashcards"):
            for fc in lec["flashcards"]:
                combined_flashcards.append({**fc, "_source_lecture": lec["title"]})

    random.shuffle(combined_quiz)
    random.shuffle(combined_flashcards)

    return {
        "quiz": combined_quiz,
        "flashcards": combined_flashcards,
        "source_lectures": source_lectures,
    }


class GenerateRequest(BaseModel):
    type: str  # "quiz" | "flashcards" | "both"


@app.post("/lectures/{lecture_id}/generate")
async def generate_more_endpoint(lecture_id: str, req: GenerateRequest):
    lecture = await get_lecture(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    transcript = lecture.get("transcript", "")
    if not transcript:
        raise HTTPException(status_code=400, detail="Lecture has no transcript")

    gen_type = req.type.strip().lower()
    if gen_type not in ("quiz", "flashcards", "both"):
        raise HTTPException(status_code=400, detail="type must be quiz, flashcards, or both")

    new_quiz: list[dict[str, Any]] = []
    new_flashcards: list[dict[str, Any]] = []
    errors: dict[str, str] = {}

    async def safe_gen_quiz():
        nonlocal new_quiz
        try:
            new_quiz = await generate_quiz(transcript)
        except Exception as exc:  # noqa: BLE001
            errors["quiz"] = str(exc)

    async def safe_gen_flashcards():
        nonlocal new_flashcards
        try:
            new_flashcards = await generate_flashcards(transcript)
        except Exception as exc:  # noqa: BLE001
            errors["flashcards"] = str(exc)

    tasks = []
    if gen_type in ("quiz", "both"):
        tasks.append(safe_gen_quiz())
    if gen_type in ("flashcards", "both"):
        tasks.append(safe_gen_flashcards())
    await asyncio.gather(*tasks)

    await update_lecture_quiz_flashcards(
        lecture_id,
        quiz=new_quiz if new_quiz else None,
        flashcards=new_flashcards if new_flashcards else None,
    )

    return {
        "new_quiz": new_quiz,
        "new_flashcards": new_flashcards,
        "errors": errors or None,
    }


# ── Serve frontend SPA (production) ───────────────────────────────────

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(request: Request, full_path: str):
        """Serve static files or fall back to index.html for client-side routing."""
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
