# Lecture2Quiz SEA

**From classroom audio to bilingual study packs.**

Upload a lecture recording — get a clean transcript, bilingual summary, quiz, and flashcards.
Built specifically for **Southeast Asian languages** with accent-aware speech models.

---

## Architecture

### High-Level Overview

```mermaid
flowchart TB
    subgraph Client["Browser"]
        FE["React 19 + Tailwind CSS\n(Vite SPA)"]
    end

    subgraph Backend["FastAPI Backend (Python)"]
        API["REST API\nuvicorn :8001"]
        Pipeline["Pipeline Orchestrator"]
        DB[(SQLite\nlectures.db)]
        Splitter["Audio Splitter\n(ffmpeg)"]
    end

    subgraph External["External AI Services"]
        direction LR
        Valsea["Valsea API\napi.valsea.ai"]
        Bedrock["AWS Bedrock\nClaude 3.5 Haiku"]
    end

    FE -- "SSE / REST\n(multipart upload)" --> API
    API --> Pipeline
    Pipeline --> Splitter
    Pipeline --> DB
    Pipeline -- "transcribe\nclarify\nformat\ntranslate" --> Valsea
    Pipeline -- "quiz generation\nflashcard generation" --> Bedrock

    style Client fill:#1e1b4b,stroke:#7c3aed,color:#e0e7ff
    style Backend fill:#022c22,stroke:#10b981,color:#d1fae5
    style External fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style Valsea fill:#172554,stroke:#3b82f6,color:#bfdbfe
    style Bedrock fill:#2e1065,stroke:#a78bfa,color:#ddd6fe
    style DB fill:#1c1917,stroke:#a3a3a3,color:#e5e5e5
```

### Processing Pipeline

The core of the system is a multi-step async pipeline that transforms raw audio into a complete study pack. Steps 3 (format, quiz, flashcards) run **in parallel** for speed.

```mermaid
flowchart LR
    A["1. Upload\nAudio"] --> B{"File > 8 MB?"}
    B -- Yes --> C["Auto-Split\n(ffmpeg ~4.5 min chunks)"]
    C --> D["Parallel\nTranscribe\n(3 concurrent)"]
    B -- No --> E["Transcribe\n(Valsea STT)"]
    D --> F["2. Clarify\n(Valsea)"]
    E --> F

    F --> G["3a. Format\nkey quotes\noverview\ntakeaways"]
    F --> H["3b. Quiz\n10 MCQ\n(Bedrock)"]
    F --> I["3c. Flashcards\neasy/med/hard\n(Bedrock)"]

    G --> J["4. Translate\n→ target language\n(Valsea)"]
    H --> J
    I --> J

    J --> K["Complete\nStudy Pack"]

    style A fill:#312e81,stroke:#818cf8,color:#e0e7ff
    style F fill:#1e3a5f,stroke:#38bdf8,color:#e0f2fe
    style G fill:#14532d,stroke:#4ade80,color:#dcfce7
    style H fill:#4a1d96,stroke:#a78bfa,color:#ede9fe
    style I fill:#4a1d96,stroke:#a78bfa,color:#ede9fe
    style J fill:#1e3a5f,stroke:#38bdf8,color:#e0f2fe
    style K fill:#064e3b,stroke:#34d399,color:#d1fae5
```

### Tech Stack

```mermaid
block-beta
    columns 3

    block:frontend["Frontend"]:3
        React["React 19"]
        Router["React Router 7"]
        Tailwind["Tailwind CSS 3"]
        Vite["Vite 6"]
        SSE["EventSource (SSE)"]
        LS["localStorage"]
    end

    block:backend["Backend"]:3
        FastAPI["FastAPI"]
        httpx["httpx (async)"]
        boto3["boto3 (Bedrock)"]
        ffmpeg["ffmpeg"]
        aiosqlite["aiosqlite"]
        pytest["pytest + respx"]
    end

    block:infra["Infrastructure"]:3
        Docker["Docker + Compose"]
        Nginx["Nginx (prod proxy)"]
        SQLite["SQLite (WAL)"]
        Render["Render.com"]
        UV["uvicorn"]
        Env[".env config"]
    end

    style frontend fill:#1e1b4b,stroke:#7c3aed,color:#c4b5fd
    style backend fill:#022c22,stroke:#10b981,color:#6ee7b7
    style infra fill:#1c1917,stroke:#a3a3a3,color:#d4d4d4
```

### Valsea APIs Used

| Endpoint | Model | Purpose |
|----------|-------|---------|
| `POST /v1/audio/transcriptions` | `valsea-transcribe` | Speech-to-text with SEA accent support (70+ languages) |
| `POST /v1/clarifications` | `valsea-clarify` | Clean noisy/colloquial transcript into clear text |
| `POST /v1/formatting` | `valsea-format` | Generate key quotes, overview, action items |
| `POST /v1/translations` | `valsea-translate` | Translate to student's native language |

### AWS Bedrock (Claude)

| Task | Output |
|------|--------|
| Quiz Generation | 10 multiple-choice questions (4 options, correct answer + explanation) |
| Flashcard Generation | Front/back cards with 3 difficulty tiers (easy, medium, hard) |

### Frontend Pages

```mermaid
flowchart LR
    subgraph SPA["React SPA (4 routes)"]
        Home["/ Home\nUpload + pipeline\nprogress (SSE)"]
        Library["/library\nBrowse saved sessions\nbilingual summaries"]
        Quiz["/quiz\nInteractive quiz room\nscore tracking"]
        Flash["/flashcards\nFlip cards\nspaced repetition"]
    end

    Home -- "save to DB" --> Library
    Library -- "load quiz" --> Quiz
    Quiz -- "wrong answers\nbecome cards" --> Flash

    style SPA fill:#1e1b4b,stroke:#7c3aed,color:#c4b5fd
    style Home fill:#312e81,stroke:#818cf8,color:#e0e7ff
    style Library fill:#1e3a5f,stroke:#38bdf8,color:#e0f2fe
    style Quiz fill:#4a1d96,stroke:#a78bfa,color:#ede9fe
    style Flash fill:#064e3b,stroke:#34d399,color:#d1fae5
```

### Student Study Flow

```mermaid
flowchart LR
    Upload["Upload\nLecture Audio"] --> Read["Read Bilingual\nSummary & Glossary"]
    Read --> Take["Take Quiz\n(10 MCQ)"]
    Take --> Review["Review Flashcards\n(includes quiz misses)"]
    Review --> Repeat["Spaced Repetition\n(localStorage)"]
    Repeat -.-> Take

    style Upload fill:#312e81,stroke:#818cf8,color:#e0e7ff
    style Read fill:#1e3a5f,stroke:#38bdf8,color:#e0f2fe
    style Take fill:#4a1d96,stroke:#a78bfa,color:#ede9fe
    style Review fill:#064e3b,stroke:#34d399,color:#d1fae5
    style Repeat fill:#422006,stroke:#f59e0b,color:#fef3c7
```

### Docker Deployment Architecture

```mermaid
flowchart TB
    User["User :3000"] --> Nginx["Nginx\n(frontend container)"]
    Nginx -- "static assets" --> SPA["React SPA\n(built by Vite)"]
    Nginx -- "/api/* proxy" --> Backend["FastAPI\n(backend container)"]
    Backend --> DB[(SQLite\n/app/data/lectures.db)]
    DB -.-> Vol["Docker Volume\ndb-data"]

    style User fill:#1e1b4b,stroke:#7c3aed,color:#e0e7ff
    style Nginx fill:#1e3a5f,stroke:#38bdf8,color:#e0f2fe
    style Backend fill:#022c22,stroke:#10b981,color:#d1fae5
    style DB fill:#1c1917,stroke:#a3a3a3,color:#e5e5e5
    style Vol fill:#422006,stroke:#f59e0b,color:#fef3c7
```

### Project Structure

```
VALSEA_PROJECT/
├── backend/
│   ├── main.py                 # FastAPI app — all REST endpoints
│   ├── db.py                   # SQLite CRUD (aiosqlite)
│   ├── services/
│   │   ├── pipeline.py         # Orchestrator: transcribe → clarify → format + quiz → translate
│   │   ├── audio_splitter.py   # ffmpeg auto-split for large files
│   │   ├── transcribe.py       # Valsea STT wrapper
│   │   ├── clarify.py          # Valsea clarification wrapper
│   │   ├── format_summary.py   # Valsea formatting (key_quotes, minutes, action_items)
│   │   ├── translate.py        # Valsea translation wrapper
│   │   ├── quiz.py             # AWS Bedrock quiz generation
│   │   └── flashcards.py       # AWS Bedrock flashcard generation
│   ├── tests/                  # pytest + respx test suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # React Router setup (4 routes)
│   │   ├── pages/
│   │   │   ├── Home.jsx        # Upload + SSE progress + results tabs
│   │   │   ├── Library.jsx     # Saved lectures browser
│   │   │   ├── Quiz.jsx        # Interactive quiz room
│   │   │   └── Flashcards.jsx  # Flip cards with spaced repetition
│   │   ├── components/
│   │   │   ├── Layout.jsx      # App shell + nav
│   │   │   ├── FlipCard.jsx    # Animated flip card component
│   │   │   └── AnalyticsPanel.jsx
│   │   └── lib/
│   │       ├── api.js          # API helpers + SSE consumer
│   │       ├── studyDeck.js    # Session/quiz state management
│   │       └── textSimilarity.js
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── Dockerfile                  # Multi-stage: Node build → Python runtime
├── docker-compose.yml          # Backend + Nginx frontend + volume
├── render.yaml                 # Render.com one-click deploy
├── llm.txt                     # Full Valsea API reference
└── .env.example
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Valsea for speech** | Purpose-built for SEA accents & languages — better accuracy than generic STT for Singlish, Vietnamese, Thai, etc. |
| **Bedrock for generation** | Claude 3.5 Haiku is fast & cheap for structured JSON output (quiz/flashcards). Retries handle throttling. |
| **SSE streaming** | Students see real-time progress ("Transcribing chunk 2/5...") instead of a mystery spinner. |
| **Auto-split** | Large lectures (>8 MB) are chunked and transcribed in parallel — transparent to the user. |
| **SQLite (WAL mode)** | Zero-config persistence. Sufficient for single-server deployment. Easily swappable to PostgreSQL. |
| **Adaptive flashcards** | Wrong quiz answers automatically become flashcards — personalized spaced repetition. |
| **Multi-stage Docker** | Single image: Node builds frontend → Python serves everything. Simple deploy anywhere. |

---

## Deploy to the Internet (Render.com — free)

The fastest way to get the app live on a public URL.

### 1. Push code to GitHub

```bash
git add -A && git commit -m "add deployment config"
git push origin main
```

### 2. Deploy on Render

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Render auto-detects the `Dockerfile` — just click **Create Web Service**
5. In the **Environment** tab, add your secret keys:
   - `VALSEA_API_KEY` = your Valsea key
   - `AWS_ACCESS_KEY_ID` = your AWS key
   - `AWS_SECRET_ACCESS_KEY` = your AWS secret
   - `BEDROCK_REGION` = `us-west-2` (or your preferred region)
6. (Optional) Under **Disks**, add a 1 GB disk mounted at `/app/data` to persist the SQLite database

Render will build and deploy automatically. Your app will be live at `https://your-app-name.onrender.com`.

> **Note:** The free tier spins down after 15 min of inactivity (first request takes ~30s to wake up). Upgrade to the $7/mo plan to keep it always on.

### Alternative: Railway.app

1. Install the Railway CLI: `npm i -g @railway/cli`
2. Run:
   ```bash
   railway login
   railway init
   railway up
   ```
3. Add environment variables in the Railway dashboard
4. Get your public URL from the dashboard

---

## Deploy with Docker (self-hosted)

Deploy the full app in one command. Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

### 1. Clone and configure

```bash
git clone <your-repo-url>
cd VALSEA_PROJECT
cp .env.example .env
```

Edit `.env` with your real keys:

```bash
VALSEA_API_KEY=vl_...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_REGION=us-west-2
```

### 2. Build and run

```bash
docker compose up -d --build
```

The app is now live at **http://your-server-ip:3000**.

To use a different port: `PORT=8080 docker compose up -d --build`

### 3. Useful commands

```bash
docker compose logs -f          # View logs
docker compose down             # Stop everything
docker compose up -d --build    # Rebuild after code changes
```

### Deploy to a VPS (DigitalOcean, AWS EC2, etc.)

1. Create a server with Docker installed (Ubuntu 22.04+ recommended)
2. Clone the repo to the server
3. Copy `.env` with your keys
4. Run `docker compose up -d --build`
5. Open port 3000 (or your chosen PORT) in firewall/security group
6. (Optional) Point your domain to the server IP

For HTTPS, add a reverse proxy like [Caddy](https://caddyserver.com/) in front — it handles Let's Encrypt certificates automatically.

---

## Local Development (without Docker)

### Setup

1. Copy env:

   ```bash
   cp .env.example .env
   # Edit .env with your keys
   ```

2. Backend:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Frontend:

   ```bash
   cd frontend
   npm install
   ```

### Run

**Terminal 1 — API:**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

**Terminal 2 — Frontend (dev server):**

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies API calls to the backend automatically.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -q
```

## Auto-split for large audio

Files over 8 MB are automatically split into ~4.5-minute MP3 chunks via `ffmpeg`, transcribed in parallel through Valsea, then recombined. Requires `ffmpeg` on the system PATH (included in Docker image).

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPLIT_MAX_CHUNK_BYTES` | `8388608` (8 MB) | Files larger than this trigger auto-split |
| `SPLIT_CHUNK_DURATION_SECS` | `270` (4.5 min) | Target duration per chunk |
| `PARALLEL_TRANSCRIPTIONS` | `3` | Max concurrent Valsea transcription requests |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| POST | `/process` | Upload audio, get transcript + quiz + flashcards (supports SSE streaming) |
| POST | `/translate` | Batch translate texts |
| POST | `/transcribe-voice` | Transcribe short voice recording |
| GET | `/lectures` | List all lectures |
| GET | `/lectures/{id}` | Get lecture detail |
| DELETE | `/lectures/{id}` | Delete a lecture |
| PATCH | `/lectures/{id}` | Rename a lecture |
| POST | `/lectures/combine` | Combine multiple lectures |
| POST | `/lectures/{id}/generate` | Generate more quiz/flashcards |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VALSEA_API_KEY` | Yes | — | [Valsea API key](https://valsea.ai/en/dashboard/api-keys) |
| `AWS_ACCESS_KEY_ID` | Yes | — | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | AWS credentials for Bedrock |
| `BEDROCK_REGION` | No | `us-east-1` | AWS region for Bedrock |
| `BEDROCK_MODEL` | No | `anthropic.claude-3-5-haiku-20241022-v1:0` | Bedrock model ID |
| `BEDROCK_CONTEXT_CHARS` | No | `24000` | Transcript chars sent to Bedrock |
| `BEDROCK_QUIZ_MAX_RETRIES` | No | `4` | Retry count for Bedrock throttling |
| `USE_MOCK_QUIZ` | No | `false` | Use mock quiz data (testing) |
| `USE_MOCK_FLASHCARDS` | No | `false` | Use mock flashcard data (testing) |
| `PORT` | No | `3000` | Host port for web app (Docker only) |

## Docs

- Full Valsea reference: [`llm.txt`](llm.txt)
