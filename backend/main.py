"""Lecture2Quiz SEA — FastAPI backend."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response

from services.clarify import clarify_text
from services.format_summary import format_key_quotes
from services.quiz import generate_quiz
from services.transcribe import transcribe_audio
from services.translate import translate_text

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="Lecture2Quiz SEA", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def root() -> str:
    """Loads without external CDN (Swagger /docs pulls JS from the internet)."""
    return """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Lecture2Quiz SEA API</title>
<style>
body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5;}
code{background:#f4f4f5;padding:0.15rem 0.35rem;border-radius:4px;}
a{color:#0369a1;}
</style></head><body>
<h1>Lecture2Quiz SEA</h1>
<p>API is running. This page is plain HTML (no CDN).</p>
<ul>
<li><a href="/health"><code>GET /health</code></a> — quick JSON check</li>
<li><a href="/openapi.json"><code>GET /openapi.json</code></a> — machine-readable schema</li>
<li><a href="/docs"><code>GET /docs</code></a> — Swagger UI <strong>(needs internet</strong> for JS/CSS from CDN; if this tab spins forever, blockers or offline network)</li>
</ul>
<p><strong>POST</strong> <code>/process</code> — upload audio from the <a href="http://127.0.0.1:5173">frontend</a> or curl.</p>
</body></html>"""


@app.get("/favicon.ico")
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _normalize_semantic_tags(raw: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list) or not raw:
        return None
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out or None


@app.post("/process")
async def process_lecture(
    audio: UploadFile = File(...),
    target_language: str = Form("vietnamese"),
    transcription_language: str = Form("english"),
) -> dict[str, Any]:
    if not os.environ.get("VALSEA_API_KEY", "").strip():
        raise HTTPException(status_code=500, detail="VALSEA_API_KEY is not configured")

    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")

    filename = audio.filename or "lecture.wav"
    content_type = audio.content_type

    async with httpx.AsyncClient() as client:
        try:
            tr = await transcribe_audio(
                client,
                file_content=content,
                filename=filename,
                content_type=content_type,
                language=transcription_language.strip().lower(),
            )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"Valsea transcription failed: {detail}",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Transcription request failed: {exc}") from exc

    raw_for_clarify = (
        (tr.get("raw_transcript") or "").strip()
        or (tr.get("text") or "").strip()
    )
    if not raw_for_clarify:
        raise HTTPException(status_code=422, detail="Transcription returned empty text")

    semantic_tags = _normalize_semantic_tags(tr.get("semantic_tags"))

    try:
        async with httpx.AsyncClient() as client:
            clean_text = await clarify_text(client, text=raw_for_clarify)
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or exc.response.reason_phrase
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Valsea clarification failed: {detail}",
        ) from exc

    if not clean_text:
        clean_text = raw_for_clarify

    quiz_error: str | None = None

    async def safe_quiz() -> list[dict[str, Any]]:
        nonlocal quiz_error
        try:
            return await generate_quiz(clean_text)
        except Exception as exc:  # noqa: BLE001 — pitch demo resilience
            quiz_error = str(exc)
            return []

    async with httpx.AsyncClient() as client:
        try:
            summary_en, quiz_items = await asyncio.gather(
                format_key_quotes(
                    client,
                    transcript=clean_text,
                    semantic_tags=semantic_tags,
                ),
                safe_quiz(),
            )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"Valsea formatting failed: {detail}",
            ) from exc

        summary_local = ""
        try:
            if summary_en.strip():
                summary_local = await translate_text(
                    client,
                    text=summary_en,
                    target_language=target_language.strip().lower(),
                )
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or exc.response.reason_phrase
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"Valsea translation failed: {detail}",
            ) from exc

    return {
        "transcript": clean_text,
        "summary_en": summary_en,
        "summary_local": summary_local,
        "quiz": quiz_items,
        "quiz_error": quiz_error,
        "meta": {
            "filename": filename,
            "target_language": target_language,
            "transcription_language": transcription_language,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
