# Lecture2Quiz SEA — Project Submission

## Elevator Pitch

Turn any lecture into bilingual study packs — quizzes, flashcards & summaries — powered by Valsea Speech AI.

---

## Project Story

### Inspiration

As students in Southeast Asia, we attend lectures delivered in mixed languages — English sprinkled with Vietnamese, Thai, Singlish, or Bahasa. Taking notes manually is exhausting and incomplete. Existing transcription tools (Whisper, Google STT) struggle badly with SEA accents and code-switching.

We asked: **What if you could just record a lecture and instantly get a complete bilingual study pack — summary, quiz, and flashcards — in both English and your native language?**

When we discovered [Valsea](https://valsea.ai) — a speech AI platform purpose-built for Southeast Asian languages — the idea clicked.

### What We Built

**Lecture2Quiz SEA** is a full-stack pipeline that transforms classroom audio into a ready-to-use study pack:

1. **Transcribe** — Valsea STT with accent-aware models (supports 70+ languages including Singlish, Vietnamese, Thai, Filipino)
2. **Clarify** — Valsea cleans noisy/colloquial speech into grammatically correct text
3. **Summarize** — Valsea formats the transcript into key quotes, overview, and takeaways
4. **Generate Quiz** — AWS Bedrock (Claude) creates 10 MCQ questions from the content
5. **Generate Flashcards** — Leveled cards (easy/medium/hard) for spaced repetition
6. **Translate** — Everything output in both English and the student's chosen language

### How We Built It

- **Backend:** Python FastAPI orchestrating the Valsea API pipeline (transcribe → clarify → format → translate) and AWS Bedrock for quiz/flashcard generation. All steps run in parallel where possible using `asyncio.gather`.
- **Frontend:** React + Tailwind CSS with real-time progress via Server-Sent Events (SSE). Includes an interactive quiz room and a flip-card spaced-repetition deck.
- **Smart audio handling:** Files over 8 MB are automatically split into ~4.5-min chunks via `ffmpeg`, transcribed in parallel, then recombined — no manual preprocessing needed.

### Challenges We Faced

1. **Large file uploads** — Valsea has a 10 MB limit per request. We solved this by building an auto-splitter that chunks audio and transcribes in parallel ($n = 3$ concurrent requests by default), then recombines in order.

2. **Network reliability** — Uploading large audio over unstable connections (VPN, campus Wi-Fi) caused `ReadError` mid-upload. We implemented retries with exponential backoff and better error messaging.

3. **Bedrock throttling** — AWS rate-limits Claude API calls. We added configurable retry logic with `BEDROCK_QUIZ_MAX_RETRIES` and context truncation to stay under token limits:
   $$\text{context\_chars} \in [4000, 120000], \quad \text{default} = 24000$$

4. **Quiz quality** — Getting Claude to produce *exactly* 10 well-formed MCQ items with consistent JSON schema required careful prompt engineering and validation.

5. **Adaptive learning loop** — Making quiz misses automatically become flashcards required a client-side state machine tracking `localStorage` sessions across quiz and flashcard pages.

### What We Learned

- Valsea's `clarify` endpoint is a game-changer — it turns messy spoken language into clean text that LLMs can actually reason about
- Running transcription, formatting, and generation in parallel cuts total latency by ~60%
- SSE provides a much better UX than polling for long-running pipelines
- Building for SEA languages requires purpose-built tools — generic models consistently fail on accents and code-switching

### What's Next

- Real-time live transcription via Valsea WebSocket (`valsea-rtt`)
- Persistent lecture library with analytics (weak topics, study streaks)
- Export to Anki deck format
- Mobile PWA for on-the-go review

---

## Built With

- Python
- FastAPI
- React
- Vite
- Tailwind CSS
- Valsea API
- AWS Bedrock
- Anthropic Claude
- httpx
- asyncio
- ffmpeg
- Server-Sent Events (SSE)
- JavaScript
- HTML/CSS
- localStorage

---

## Try It Out

```bash
# Terminal 1 — Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend
npm install && npm run dev
```

Open **http://127.0.0.1:5173** → Upload audio → Get your study pack.

### Demo Mode (no API keys needed)

```bash
# .env
USE_MOCK_QUIZ=true
USE_MOCK_FLASHCARDS=true
```

---

## Links

- Valsea API: https://valsea.ai
- Valsea Docs: https://valsea.ai/docs
- Tutorial Slides: [tutorial.html](../tutorial.html)
