# VALSEA_PROJECT — Lecture2Quiz SEA (pitch MVP)

**Lecture2Quiz SEA** — From classroom audio to bilingual study packs.

## Stack

- **Backend:** Python FastAPI (`backend/`) — Valsea (transcribe → clarify → format → translate) + Google Gemini (quiz).
- **Frontend:** Static HTML + Tailwind CDN (`frontend/`).

## Setup

1. Copy env:

   - `VALSEA_API_KEY` — from [Valsea dashboard](https://valsea.ai/en/dashboard/api-keys)
   - `GEMINI_API_KEY` — from Google AI Studio

   Root [`.env`](.env) example:

   ```bash
   VALSEA_API_KEY=vl_...
   GEMINI_API_KEY=...
   ```

2. Install backend deps:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

## Run

**Terminal 1 — API**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Browser:** Open **http://127.0.0.1:8000** — not `http://0.0.0.0:8000` (bind-only; browsers often hang). The home page is plain HTML with links. **`/docs` (Swagger)** loads JavaScript from a CDN; if that tab never finishes, try **`GET /health`** or **`GET /openapi.json`** instead, or allowlist `cdn.jsdelivr.net` / disable aggressive blockers.

**Terminal 2 — Frontend**

```bash
cd frontend
python3 -m http.server 5173
```

Open **http://127.0.0.1:5173** — the UI posts to **http://127.0.0.1:8000/process** ([`frontend/app.js`](frontend/app.js)).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/process` | `multipart/form-data`: `audio`, `target_language`, `transcription_language` |

Response: `transcript`, `summary_en`, `summary_local`, `quiz`, optional `quiz_error`.

## Troubleshooting “won’t load”

1. **Confirm the server is running** — In the terminal where you started uvicorn you should see `Uvicorn running on http://0.0.0.0:8000`. No log / errors → start uvicorn again from `backend/` with venv activated.
2. **Use `127.0.0.1`, not `0.0.0.0`** in the browser address bar.
3. **`/docs` spinning** — Swagger pulls assets from the internet; offline networks, VPN, or ad/script blockers can block the CDN. Open **`http://127.0.0.1:8000/`** (simple page) or **`http://127.0.0.1:8000/health`** — if those work, the API is fine.
4. **Quick CLI check:** `curl -s http://127.0.0.1:8000/health` should print `{"status":"ok"}`.

## Docs

- Full Valsea reference: [`llm.txt`](llm.txt)
- Cursor skill: [`.cursor/skills/valsea-api/SKILL.md`](.cursor/skills/valsea-api/SKILL.md)
