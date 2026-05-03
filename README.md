# VALSEA_PROJECT — Lecture2Quiz SEA (pitch MVP)

**Lecture2Quiz SEA** — From classroom audio to bilingual study packs.

## Stack

- **Backend:** Python FastAPI (`backend/`) — Valsea (transcribe → clarify → format → translate) + Google Gemini (quiz + **leveled flashcards**).
- **Frontend:** Static HTML + Tailwind CDN (`frontend/`).

## Setup

1. Copy env:

   - `VALSEA_API_KEY` — from [Valsea dashboard](https://valsea.ai/en/dashboard/api-keys)
   - `GEMINI_API_KEY` — from Google AI Studio

   Root [`.env`](.env) example:

   ```bash
   VALSEA_API_KEY=vl_...
   GEMINI_API_KEY=...
   # Optional — if Gemini returns 429 / quota (free tier):
   # GEMINI_MODEL=gemini-2.5-flash-lite
   # GEMINI_QUIZ_CONTEXT_CHARS=18000
   # GEMINI_QUIZ_MAX_RETRIES=4
   # Optional — demo quiz without Gemini (loads frontend/mock-quiz.json server-side):
   # USE_MOCK_QUIZ=true
   # Optional — demo flashcards without Gemini (loads frontend/mock-flashcards.json server-side):
   # USE_MOCK_FLASHCARDS=true
   ```

2. Create the backend virtualenv (once) and install deps:

   ```bash
   cd /Users/doa_ai/Developer/VALSEA_PROJECT/backend
   python3 -m venv .venv
   source /Users/doa_ai/Developer/VALSEA_PROJECT/backend/.venv/bin/activate
   pip install -r requirements.txt
   ```

   After this, **activate the same venv** in every new terminal:

   ```bash
   source /Users/doa_ai/Developer/VALSEA_PROJECT/backend/.venv/bin/activate
   ```

   (Equivalent relative path from `backend/`: `source .venv/bin/activate`. Windows: `backend\.venv\Scripts\activate`.)

## Run

**Terminal 1 — API**

```bash
source /Users/doa_ai/Developer/VALSEA_PROJECT/backend/.venv/bin/activate
cd /Users/doa_ai/Developer/VALSEA_PROJECT/backend
pip install -r requirements.txt   # once
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

Default port **8001** avoids conflicts with other apps (e.g. IDE tools on **8000**). If you see **`[Errno 48] Address already in use`**, pick another free port: `--port 8002` and set `API_BASE` in [`frontend/app.js`](frontend/app.js) to match.

Use **`127.0.0.1`** here if opening the API only on your machine avoids confusing firewall/VPN behavior; use **`0.0.0.0`** when another device on the LAN must connect (then browse using your machine’s LAN IP, not `0.0.0.0`).

**Browser:** Open **http://127.0.0.1:8001** — not `http://0.0.0.0:8001` (bind-only; browsers often hang). The home page is plain HTML with links. **`/docs` (Swagger)** loads JavaScript from a CDN; if that tab never finishes, try **`GET /health`** or **`GET /openapi.json`** instead, or allowlist `cdn.jsdelivr.net` / disable aggressive blockers.

**Terminal 2 — Frontend**

```bash
cd frontend
python3 -m http.server 5173
```

Open **http://127.0.0.1:5173** — the UI posts to **http://127.0.0.1:8001/process** ([`frontend/app.js`](frontend/app.js)).

After a successful run, **http://127.0.0.1:5173/quiz.html** opens the full-screen quiz room (session bundle or demo [`frontend/mock-quiz.json`](frontend/mock-quiz.json)). **http://127.0.0.1:5173/flashcards.html** is the spaced-repetition deck (ingests pipeline flashcards from the same session + **personalized cards from quiz misses** stored in `localStorage`).

## Tests

Run pytest **from the project venv** (not Conda/base Python — those won’t have `respx` / `pytest-asyncio` unless you installed them there):

```bash
source /Users/doa_ai/Developer/VALSEA_PROJECT/backend/.venv/bin/activate
cd /Users/doa_ai/Developer/VALSEA_PROJECT/backend
pip install -r requirements.txt   # installs pytest, pytest-asyncio, respx
pytest tests/ -q
```

Or explicitly: `/Users/doa_ai/Developer/VALSEA_PROJECT/backend/.venv/bin/pytest tests/ -q`

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/process` | `multipart/form-data`: `audio`, `target_language`, `transcription_language`, optional **`stream`** (`true` / `false`). When `stream=true`, response is **`text/event-stream`** (SSE): JSON lines `{"type":"phase",...}`, then `{"type":"complete","payload":{...}}` or `{"type":"error",...}`. |

Response (JSON mode): `transcript`, `summary_en`, `summary_local`, `quiz`, optional `quiz_error`, **`flashcards`** (each item: `front`, `back`, `difficulty`: `easy`|`medium`|`hard`, `card_type`), optional **`flashcards_error`**.

## Troubleshooting “won’t load”

1. **Confirm the server is running** — In the terminal where you started uvicorn you should see `Uvicorn running on http://127.0.0.1:8001`. No log / errors → start uvicorn again from `backend/` with venv activated.
2. **`Address already in use`** — Another program owns that port (check with `lsof -nP -iTCP:8001 -sTCP:LISTEN`). Use a different `--port` and update `API_BASE` in `frontend/app.js`.
3. **Use `127.0.0.1`, not `0.0.0.0`** in the browser address bar.
4. **`/docs` spinning** — Swagger pulls assets from the internet; offline networks, VPN, or ad/script blockers can block the CDN. Open **`http://127.0.0.1:8001/`** (simple page) or **`http://127.0.0.1:8001/health`** — if those work, the API is fine.
5. **Quick CLI check:** `curl -s http://127.0.0.1:8001/health` should print `{"status":"ok"}`.
6. **HTTP 502 on `POST /process`** — Almost always **transport failure to `https://api.valsea.ai`** (offline VPN, firewall, DNS, or timeout while uploading a large file). Read the JSON `detail` and check uvicorn logs for `Valsea … transport error`. Quick check (needs **POST**; bare GET often returns **404**):  
   `curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://api.valsea.ai/v1/audio/transcriptions` — expect **401** without a key (means TLS/route OK), not a hang.
7. **`ReadError` during transcription** — Connection often drops mid-upload or mid-response (very large **MP4**/slow uplink, VPN, proxy). Try: **smaller file** (Valsea max **10 MB** audio per [`llm.txt`](llm.txt)), extract audio only (`ffmpeg -i lesson.mp4 -vn -acodec libmp3lame -q:a 4 lesson.mp3`), turn **VPN off** for a test. Backend timeouts for transcribe were increased in [`backend/services/transcribe.py`](backend/services/transcribe.py).
8. **Gemini quiz `429` / quota** — Free tier limits reset over time; enable **billing** in [Google AI Studio](https://aistudio.google.com/) if needed. In `.env` try **`GEMINI_MODEL=gemini-2.5-flash-lite`** (or another model your project supports), lower **`GEMINI_QUIZ_CONTEXT_CHARS`** (default 24000), and **`GEMINI_QUIZ_MAX_RETRIES`** — see [`backend/services/quiz.py`](backend/services/quiz.py). Docs: https://ai.google.dev/gemini-api/docs/rate-limits

### Smoke test Valsea (real multipart + API key)

From project root (loads `.env` yourself — do **not** paste your key into shell history):

```bash
set -a && source .env && set +a
curl -sS -w "\nhttp_code:%{http_code}\n" \
  -X POST https://api.valsea.ai/v1/audio/transcriptions \
  -H "Authorization: Bearer ${VALSEA_API_KEY}" \
  -F "model=valsea-transcribe" \
  -F "language=english" \
  -F "response_format=json" \
  -F "file=@/Users/doa_ai/Developer/VALSEA_PROJECT/data/lesson_math_clip_12-24min.mp3"
```

Replace **`/path/to/small-under-10mb.wav`** with a **real file** on your machine. If you see **`curl: (26) Failed to open/read local data`**, the path is wrong or the file does not exist (copy-paste placeholders like `/đường/dẫn/...` will fail). For paths with spaces or `!`, use a variable:

```bash
FILE="$PWD/data/your-file.wav"
curl ... -F "file=@${FILE}"
```

You should get **200** and JSON with `"text"`. If **413**, file too large; if **`ReadError`/hang** in app but this **curl** works, compare file size and format.

## Docs

- Full Valsea reference: [`llm.txt`](llm.txt)
- Cursor skill: [`.cursor/skills/valsea-api/SKILL.md`](.cursor/skills/valsea-api/SKILL.md)
