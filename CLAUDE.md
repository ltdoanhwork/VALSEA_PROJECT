# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lecture2Quiz SEA** converts lecture audio into bilingual study packs (transcript, summary, quiz, flashcards). Built for Southeast Asian languages with accent-aware speech models using Valsea API and AWS Bedrock (Claude).

- **Backend**: FastAPI (Python) with async pipeline orchestration
- **Frontend**: React 19 + React Router 7 + Tailwind CSS (Vite SPA)
- **Storage**: SQLite with WAL mode
- **External Services**: Valsea API (transcribe/clarify/format/translate), AWS Bedrock (quiz/flashcard generation)

## Development Commands

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run dev server (port 8001)
uvicorn main:app --reload --host 127.0.0.1 --port 8001

# Run tests
pytest tests/ -q

# Run specific test file
pytest tests/test_quiz.py -v

# Run with coverage
pytest tests/ --cov=. --cov-report=term-missing
```

### Frontend

```bash
cd frontend
npm install

# Run dev server (port 5173, proxies API to :8001)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Docker

```bash
# Build and run full stack
docker compose up -d --build

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Rebuild after changes
docker compose up -d --build
```

## Architecture & Data Flow

### Pipeline Orchestration (`backend/services/pipeline.py`)

The core processing flow is async and runs in stages:

1. **Upload & Split** (if >8 MB): `audio_splitter.py` uses ffmpeg to chunk large files into ~4.5 min segments
2. **Parallel Transcription**: Up to 3 concurrent Valsea STT requests, recombined into single transcript
3. **Clarify**: Valsea cleans colloquial/noisy text
4. **Parallel Generation** (3 tasks run concurrently):
   - Format summary (`format_summary.py` → Valsea)
   - Generate quiz (`quiz.py` → Bedrock)
   - Generate flashcards (`flashcards.py` → Bedrock)
5. **Translate**: Batch translate all content to target language via Valsea

**Progress tracking**: Pipeline emits SSE events at each phase. Frontend (`Home.jsx`) displays real-time progress via `EventSource`.

### Database Layer (`backend/db.py`)

- SQLite with `aiosqlite` for async operations
- Single `lectures` table stores all pipeline results as JSON
- WAL mode enabled for concurrent reads during writes
- Database path: `backend/data/lectures.db` (created on first run)

### Frontend State Management

- **Session state**: `lib/studyDeck.js` manages quiz/flashcard sessions in `localStorage`
- **API client**: `lib/api.js` wraps fetch calls and SSE streaming
- **Routing**: 4 pages (`Home`, `Library`, `Quiz`, `Flashcards`) via React Router

### External Service Wrappers

Each external service has a dedicated wrapper in `backend/services/`:
- `transcribe.py`, `clarify.py`, `format_summary.py`, `translate.py` → Valsea API
- `quiz.py`, `flashcards.py` → AWS Bedrock with retry logic for throttling

All use `httpx.AsyncClient` for concurrent requests.

## Important Design Rules

### UI Development

**Never expose infrastructure details in user-facing UI** (enforced by `.cursor/rules/no-internal-details-in-ui.mdc`):
- ❌ No API keys, env var names, server ports, setup instructions
- ❌ No internal service names (FastAPI, Bedrock, Valsea)
- ❌ No file paths or config references
- ✅ Keep infrastructure details in README.md and backend only

### Error Handling

- Pipeline errors use `LecturePipelineError(status_code, detail)` for HTTP-friendly errors
- Network failures include detailed diagnostics (see `_transport_failure_detail()` in `pipeline.py`)
- Bedrock throttling is handled with exponential backoff in `quiz.py` and `flashcards.py`

### Testing

- Tests use `respx` to mock HTTP calls to Valsea/Bedrock
- `conftest.py` provides shared fixtures
- Mock data available: `USE_MOCK_QUIZ=true` and `USE_MOCK_FLASHCARDS=true` env vars
- Tests require `ffmpeg` in PATH for audio splitter tests

## Key Files

### Backend Entry Points
- `main.py` — All FastAPI routes and SSE streaming logic
- `db.py` — Complete SQLite CRUD layer

### Pipeline Services (all async)
- `services/pipeline.py` — Orchestrator that runs the full pipeline
- `services/audio_splitter.py` — ffmpeg wrapper for chunking large audio
- `services/transcribe.py` — Valsea STT wrapper
- `services/quiz.py` — Bedrock quiz generation with retries
- `services/flashcards.py` — Bedrock flashcard generation

### Frontend Pages
- `pages/Home.jsx` — Upload form + SSE progress display + results tabs
- `pages/Library.jsx` — Browse saved lectures
- `pages/Quiz.jsx` — Interactive quiz with score tracking
- `pages/Flashcards.jsx` — Flip cards with difficulty levels

## Environment Variables

Required in `.env`:
```bash
VALSEA_API_KEY=vl_...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_REGION=us-east-1
```

Optional tuning:
- `SPLIT_MAX_CHUNK_BYTES=8388608` — Files larger trigger auto-split
- `SPLIT_CHUNK_DURATION_SECS=270` — Target chunk duration (4.5 min)
- `PARALLEL_TRANSCRIPTIONS=3` — Max concurrent Valsea requests
- `BEDROCK_CONTEXT_CHARS=24000` — Transcript chars sent to Bedrock
- `BEDROCK_QUIZ_MAX_RETRIES=4` — Retry count for throttling

## Common Gotchas

1. **Valsea API requires file uploads as multipart/form-data** — see `transcribe.py` for proper formatting
2. **Large audio auto-splitting is transparent** — pipeline automatically chunks, transcribes in parallel, and recombines
3. **SSE streaming requires proper headers** — `Content-Type: text/event-stream`, `Cache-Control: no-cache`
4. **Bedrock throttling is common** — quiz/flashcard generation includes exponential backoff retry logic
5. **Frontend dev proxy** — Vite proxies `/process`, `/lectures`, `/translate` to `:8001` (see `vite.config.js`)
6. **SQLite WAL mode** — Allows concurrent reads during writes, enabled in `db.py`

## Full Valsea API Reference

See `llm.txt` for complete Valsea API documentation with curl examples.
