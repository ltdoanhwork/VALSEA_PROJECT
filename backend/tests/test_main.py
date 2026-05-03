"""FastAPI route tests (mocked external APIs)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_html() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "Lecture2Quiz SEA" in response.text
    assert "/health" in response.text


def test_favicon_no_404() -> None:
    response = client.get("/favicon.ico")
    assert response.status_code == 204


def test_openapi_available() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Lecture2Quiz SEA"


def test_process_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VALSEA_API_KEY", "")
    files = {"audio": ("x.wav", b"x", "audio/wav")}
    response = client.post("/process", files=files)
    assert response.status_code == 500
    assert "VALSEA_API_KEY" in response.json()["detail"]


def test_process_empty_file() -> None:
    files = {"audio": ("empty.wav", b"", "audio/wav")}
    response = client.post("/process", files=files)
    assert response.status_code == 400


def test_process_empty_transcription() -> None:
    with patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr:
        tr.return_value = {"text": "", "raw_transcript": ""}
        files = {"audio": ("a.wav", b"fake", "audio/wav")}
        response = client.post("/process", files=files)
    assert response.status_code == 422


def test_process_transcription_connect_error_502() -> None:
    with patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr:
        tr.side_effect = httpx.ConnectError("cannot reach api.valsea.ai")
        files = {"audio": ("a.wav", b"bytes", "audio/wav")}
        response = client.post("/process", files=files)
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "Cannot reach Valsea" in detail or "ConnectError" in detail


def test_process_transcription_http_status_propagates() -> None:
    req = httpx.Request("POST", "https://api.valsea.ai/v1/audio/transcriptions")
    err_resp = httpx.Response(401, request=req, text="invalid key")

    with patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr:
        tr.side_effect = httpx.HTTPStatusError("401", request=req, response=err_resp)
        files = {"audio": ("a.wav", b"bytes", "audio/wav")}
        response = client.post("/process", files=files)
    assert response.status_code == 401


def test_process_success_pipeline_mocked() -> None:
    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {
            "text": "Intro.",
            "raw_transcript": "intro noisy",
            "semantic_tags": [{"tag": "math", "phrase": "pi", "meaning": "3.14"}],
        }
        cl.return_value = "Intro cleaned."
        fmt.return_value = "- Pi is important"
        tl.return_value = "- Pi rất quan trọng"
        gq.return_value = [
            {
                "question": "What is Pi?",
                "options": {"A": "3", "B": "3.14", "C": "4", "D": "1"},
                "answer": "B",
            }
        ]
        gf.return_value = [
            {"front": "What is Pi?", "back": "Roughly 3.14", "difficulty": "easy", "card_type": "definition"}
        ]

        files = {"audio": ("lesson.wav", b"\xff\xfb\x90", "audio/wav")}
        data = {"target_language": "vietnamese", "transcription_language": "english"}
        response = client.post("/process", files=files, data=data)

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "Intro cleaned."
    assert body["summary_en"] == "- Pi is important"
    assert body["summary_local"] == "- Pi rất quan trọng"
    assert len(body["quiz"]) == 1
    assert body["quiz_error"] is None
    assert len(body["flashcards"]) == 1
    assert body["flashcards_error"] is None
    assert body["meta"]["filename"] == "lesson.wav"


def test_process_quiz_failure_returns_quiz_error() -> None:
    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "Body.", "raw_transcript": "Body."}
        cl.return_value = "Body."
        fmt.return_value = "Summary."
        tl.return_value = "Tóm tắt."
        gq.side_effect = RuntimeError("Gemini down")
        gf.return_value = []

        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["quiz"] == []
    assert body["quiz_error"] == "Gemini down"
    assert body["flashcards"] == []
    assert body["flashcards_error"] is None


def test_process_flashcards_failure_returns_flashcards_error() -> None:
    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "Body.", "raw_transcript": "Body."}
        cl.return_value = "Body."
        fmt.return_value = "Summary."
        tl.return_value = "Tóm tắt."
        gq.return_value = []
        gf.side_effect = RuntimeError("Flashcards down")

        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["quiz"] == []
    assert body["quiz_error"] is None
    assert body["flashcards"] == []
    assert body["flashcards_error"] == "Flashcards down"


def test_process_clarify_http_error() -> None:
    req = httpx.Request("POST", "https://api.valsea.ai/clarify")
    err_resp = httpx.Response(503, request=req)

    with patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr, patch(
        "services.pipeline.clarify_text",
        new_callable=AsyncMock,
    ) as cl:
        tr.return_value = {"text": "Raw text.", "raw_transcript": "Raw text."}
        cl.side_effect = httpx.HTTPStatusError("503", request=req, response=err_resp)
        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files)

    assert response.status_code == 503


def test_process_format_http_error() -> None:
    req = httpx.Request("POST", "https://api.valsea.ai/format")
    err_resp = httpx.Response(500, request=req)

    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "T.", "raw_transcript": "T."}
        cl.return_value = "T."
        fmt.side_effect = httpx.HTTPStatusError("500", request=req, response=err_resp)
        gq.return_value = []
        gf.return_value = []

        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files)

    assert response.status_code == 500


def test_process_translate_http_error() -> None:
    req = httpx.Request("POST", "https://api.valsea.ai/translate")
    err_resp = httpx.Response(402, request=req)

    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "T.", "raw_transcript": "T."}
        cl.return_value = "T."
        fmt.return_value = "Summary EN"
        gq.return_value = []
        gf.return_value = []
        tl.side_effect = httpx.HTTPStatusError("402", request=req, response=err_resp)

        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files)

    assert response.status_code == 402


def test_process_stream_includes_phases_and_complete() -> None:
    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "Hello.", "raw_transcript": "Hello."}
        cl.return_value = "Hello."
        fmt.return_value = "Bullet"
        tl.return_value = "Tiêu điểm"
        gq.return_value = []
        gf.return_value = []
        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files, data={"stream": "true"})

    assert response.status_code == 200
    ct = response.headers.get("content-type") or ""
    assert "text/event-stream" in ct
    body = response.text
    assert "transcribe" in body and "clarify" in body
    assert "complete" in body
    assert "Hello." in body


def test_process_stream_missing_api_key_emits_error_sse(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VALSEA_API_KEY", "")
    files = {"audio": ("a.wav", b"x", "audio/wav")}
    response = client.post("/process", files=files, data={"stream": "true"})
    assert response.status_code == 200
    assert "error" in response.text
    assert "VALSEA_API_KEY" in response.text


def test_process_json_when_stream_disabled() -> None:
    with (
        patch("services.pipeline.transcribe_audio", new_callable=AsyncMock) as tr,
        patch("services.pipeline.clarify_text", new_callable=AsyncMock) as cl,
        patch("services.pipeline.format_key_quotes", new_callable=AsyncMock) as fmt,
        patch("services.pipeline.translate_text", new_callable=AsyncMock) as tl,
        patch("services.pipeline.generate_quiz", new_callable=AsyncMock) as gq,
        patch("services.pipeline.generate_flashcards", new_callable=AsyncMock) as gf,
    ):
        tr.return_value = {"text": "X.", "raw_transcript": "X."}
        cl.return_value = "X."
        fmt.return_value = "Y"
        tl.return_value = "Z"
        gq.return_value = []
        gf.return_value = []
        files = {"audio": ("a.wav", b"x", "audio/wav")}
        response = client.post("/process", files=files, data={"stream": "false"})

    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("application/json")
    assert response.json()["transcript"] == "X."
