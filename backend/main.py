"""Lecture2Quiz SEA — FastAPI backend."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse

from services.pipeline import LecturePipelineError, run_lecture_pipeline

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
<p><strong>POST</strong> <code>/process</code> — upload audio (<code>stream=true</code> for SSE progress).</p>
</body></html>"""


@app.get("/favicon.ico")
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


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
        return await run_lecture_pipeline(
            file_content=content,
            filename=filename,
            content_type=content_type,
            target_language=target_language,
            transcription_language=transcription_language,
            progress=None,
        )
    except LecturePipelineError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
