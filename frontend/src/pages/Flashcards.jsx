import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  SESSION_KEY,
  loadDeck,
  ingestPipelineCards,
  scheduleNext,
  logReview,
  pushUndo,
  popUndo,
  getAnalytics,
  exportProgress,
  migrateLegacyMistakeCards,
} from "../lib/studyDeck";
import { translateBatch, transcribeVoice } from "../lib/api";
import { compareSimilarity } from "../lib/textSimilarity";
import AnalyticsPanel from "../components/AnalyticsPanel";

const TRANSLATE_LANGS = [
  { code: "original", label: "Original" },
  { code: "english", label: "English" },
  { code: "vietnamese", label: "Tiếng Việt" },
  { code: "thai", label: "ไทย" },
  { code: "indonesian", label: "Indonesian" },
  { code: "malay", label: "Malay" },
  { code: "filipino", label: "Filipino" },
  { code: "chinese", label: "中文" },
  { code: "japanese", label: "日本語" },
  { code: "korean", label: "한국어" },
  { code: "french", label: "Français" },
  { code: "spanish", label: "Español" },
];

function passesFilter(card, filter) {
  if (filter === "all") return true;
  if (filter === "mistake") return card.source === "mistake";
  return card.difficulty === filter;
}

function speak(text) {
  const ss = window.speechSynthesis;
  if (!ss) return;
  ss.cancel();
  ss.speak(new SpeechSynthesisUtterance(text));
}

function downloadFile(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  }).click();
  URL.revokeObjectURL(url);
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <polygon
        points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
        fill="currentColor"
        stroke="none"
      />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function MicIcon({ recording }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={recording ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${recording ? "text-rose-400 animate-pulse" : ""}`}
    >
      <rect x="9" y="1" width="6" height="11" rx="3" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

const SWIPE_THRESHOLD = 60;

export default function Flashcards() {
  const [mode, setMode] = useState("due");
  const [filter, setFilter] = useState("all");
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [deckVersion, setDeckVersion] = useState(0);
  const [ingestCount, setIngestCount] = useState(0);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showUndoBtn, setShowUndoBtn] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [cardLang, setCardLang] = useState("original");
  const [translating, setTranslating] = useState(false);
  const translationCache = useRef({});
  const [sourceLectures, setSourceLectures] = useState([]);

  // Voice Recall state
  const [vrRecording, setVrRecording] = useState(false);
  const [vrTranscribing, setVrTranscribing] = useState(false);
  const [vrTranscript, setVrTranscript] = useState("");
  const [vrResult, setVrResult] = useState(null); // { score, suggestion, ... }
  const [vrStep, setVrStep] = useState("idle"); // idle | listening | processing | result
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const undoTimer = useRef(null);
  const touchRef = useRef({ startX: 0, startY: 0, swiped: false });

  useEffect(() => {
    migrateLegacyMistakeCards();
    setIngestCount(ingestPipelineCards());
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const b = JSON.parse(raw);
        if (b.source_lectures) setSourceLectures(b.source_lectures);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const deck = loadDeck();
    const now = Date.now();
    let pool = deck.filter((c) => passesFilter(c, filter));
    if (mode === "due") {
      pool = pool
        .filter((c) => (c.nextReviewAt ?? 0) <= now)
        .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
    } else {
      pool = [...pool].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
    }
    setQueue(pool);
    setPos(0);
    setFlipped(false);
    setDoneMsg("");
    vrReset();
  }, [mode, filter, deckVersion]);

  const deck = loadDeck();
  const now = Date.now();
  const dueCount = deck.filter(
    (c) => passesFilter(c, filter) && (c.nextReviewAt ?? 0) <= now,
  ).length;
  const totalCount = deck.length;
  const mistakeCount = deck.filter((c) => c.source === "mistake").length;

  const card = queue[pos];
  const progress = queue.length > 0 ? Math.round((pos / queue.length) * 100) : 0;

  /* ── Translation ───────────────────────────────────────────── */

  const handleLangChange = useCallback(
    async (langCode) => {
      setCardLang(langCode);
      if (langCode === "original" || !queue.length) return;

      const cacheKey = queue.map((c) => c.id).join(",") + ":" + langCode;
      if (translationCache.current[cacheKey]) return;

      setTranslating(true);
      try {
        const texts = [];
        queue.forEach((c) => {
          texts.push(c.front);
          texts.push(c.back);
        });
        const out = await translateBatch(texts, langCode);
        const translated = {};
        let i = 0;
        queue.forEach((c) => {
          translated[c.id] = { front: out[i++], back: out[i++] };
        });
        translationCache.current[cacheKey] = translated;
      } catch (err) {
        console.error("Translation failed:", err);
        setCardLang("original");
      } finally {
        setTranslating(false);
      }
    },
    [queue],
  );

  function translatedCard(c) {
    if (cardLang === "original" || !c) return c;
    const cacheKey = queue.map((x) => x.id).join(",") + ":" + cardLang;
    const map = translationCache.current[cacheKey];
    if (!map || !map[c.id]) return c;
    return { ...c, front: map[c.id].front, back: map[c.id].back };
  }

  const displayCard = card ? translatedCard(card) : null;

  /* ── Voice Recall ──────────────────────────────────────────── */

  function vrReset() {
    setVrStep("idle");
    setVrTranscript("");
    setVrResult(null);
    setVrRecording(false);
    setVrTranscribing(false);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  function vrReadFront() {
    if (!card) return;
    const dc = displayCard || card;
    speak(dc.front);
    setVrStep("listening");
  }

  async function vrStartRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) {
          setVrStep("listening");
          return;
        }
        setVrStep("processing");
        setVrTranscribing(true);
        try {
          const text = await transcribeVoice(blob);
          setVrTranscript(text);
          const expected = card?.back || "";
          const result = compareSimilarity(text, expected);
          setVrResult(result);
          setVrStep("result");
        } catch (err) {
          console.error("Voice transcription failed:", err);
          setVrTranscript("(transcription failed)");
          setVrResult({ score: 0, suggestion: "again", matchedWords: 0, totalWords: 0 });
          setVrStep("result");
        } finally {
          setVrTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVrRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }

  function vrStopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setVrRecording(false);
  }

  function vrAcceptSuggestion() {
    if (!vrResult || !card) return;
    handleRate(vrResult.suggestion);
    vrReset();
  }

  function vrSkip() {
    vrReset();
    if (pos + 1 >= queue.length) {
      setDoneMsg("Queue cleared. Come back when cards are due.");
    } else {
      setPos((p) => p + 1);
    }
  }

  /* ── Rate + undo ──────────────────────────────────────────── */

  const handleRate = useCallback(
    (rating) => {
      if (!card) return;
      pushUndo(card.id);
      scheduleNext(card.id, rating);
      logReview(card.id, rating);

      clearTimeout(undoTimer.current);
      setShowUndoBtn(true);
      undoTimer.current = setTimeout(() => setShowUndoBtn(false), 5000);

      if (pos + 1 >= queue.length) {
        setDoneMsg("Queue cleared. Come back when cards are due.");
      } else {
        setPos((p) => p + 1);
        setFlipped(false);
      }
      setDeckVersion((v) => v + 1);
    },
    [card, pos, queue.length],
  );

  const handleUndo = useCallback(() => {
    const prev = popUndo();
    if (!prev) return;
    setShowUndoBtn(false);
    clearTimeout(undoTimer.current);

    const d = loadDeck();
    const n = Date.now();
    let pool = d.filter((c) => passesFilter(c, filter));
    if (mode === "due") {
      pool = pool
        .filter((c) => (c.nextReviewAt ?? 0) <= n)
        .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
    } else {
      pool = [...pool].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
    }
    const idx = pool.findIndex((c) => c.id === prev.cardId);
    setQueue(pool);
    setPos(idx >= 0 ? idx : 0);
    setFlipped(false);
    setDoneMsg("");
  }, [filter, mode]);

  /* ── Keyboard shortcuts ───────────────────────────────────── */

  const handleRateRef = useRef(handleRate);
  handleRateRef.current = handleRate;

  const stateRef = useRef();
  stateRef.current = { flipped, queue, pos, mode };

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      const { flipped, queue, pos, mode } = stateRef.current;
      if (e.code === "Space" && mode !== "voice") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (mode === "browse" || mode === "voice") {
        if (e.code === "ArrowLeft" && pos > 0) {
          setPos((p) => p - 1);
          setFlipped(false);
        }
        if (e.code === "ArrowRight" && pos < queue.length - 1) {
          setPos((p) => p + 1);
          setFlipped(false);
        }
        return;
      }
      if (!flipped || pos >= queue.length) return;
      const ratings = {
        Digit1: "again",
        Digit2: "hard",
        Digit3: "good",
        Digit4: "easy",
      };
      const r = ratings[e.code];
      if (r) handleRateRef.current(r);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Swipe gestures ───────────────────────────────────────── */

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, swiped: false };
  };

  const onTouchMove = (e) => {
    if (!flipped || !card || mode === "voice") return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    const dy = e.touches[0].clientY - touchRef.current.startY;
    if (Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      touchRef.current.swiped = true;
      setSwipeX(dx);
    }
  };

  const onTouchEnd = () => {
    if (touchRef.current.swiped && flipped && card) {
      if (swipeX < -SWIPE_THRESHOLD) handleRate("again");
      else if (swipeX > SWIPE_THRESHOLD) handleRate("good");
    }
    setSwipeX(0);
    setTimeout(() => {
      touchRef.current.swiped = false;
    }, 50);
  };

  const handleFlipClick = () => {
    if (touchRef.current.swiped) return;
    if (mode === "voice" && vrStep !== "result") return;
    setFlipped((f) => !f);
  };

  const swipeStyle =
    swipeX !== 0
      ? {
          transform: `translateX(${swipeX}px) rotate(${swipeX * 0.03}deg)`,
          transition: "none",
        }
      : { transition: "transform 0.3s ease-out" };

  /* ── Export ────────────────────────────────────────────────── */

  const handleExport = (fmt) => {
    const content = exportProgress(fmt);
    const ext = fmt === "csv" ? "csv" : "json";
    const mime = fmt === "csv" ? "text/csv" : "application/json";
    downloadFile(content, `flashcard-progress.${ext}`, mime);
  };

  /* ── Analytics data ───────────────────────────────────────── */

  const analytics = showAnalytics ? getAnalytics() : null;

  /* ── UI data ──────────────────────────────────────────────── */

  const modeButtons = [
    { key: "due", label: "Due" },
    { key: "browse", label: "Browse" },
    { key: "voice", label: "Voice" },
  ];

  const filterButtons = [
    { key: "all", label: "All", textColor: "text-slate-400" },
    { key: "easy", label: "Easy", textColor: "text-emerald-400/80" },
    { key: "medium", label: "Medium", textColor: "text-amber-400/80" },
    { key: "hard", label: "Hard", textColor: "text-rose-400/80" },
    { key: "mistake", label: "Mistakes", textColor: "text-slate-400" },
  ];

  const rateButtons = [
    {
      key: "again",
      label: "Again",
      sub: "10 min",
      border: "border-rose-500/20",
      bg: "bg-rose-500/[0.06]",
      hover: "hover:bg-rose-500/[0.12]",
      text: "text-rose-400",
    },
    {
      key: "hard",
      label: "Hard",
      sub: "1 day",
      border: "border-amber-500/20",
      bg: "bg-amber-500/[0.06]",
      hover: "hover:bg-amber-500/[0.12]",
      text: "text-amber-400",
    },
    {
      key: "good",
      label: "Good",
      sub: "3 days",
      border: "border-indigo-500/20",
      bg: "bg-indigo-500/[0.06]",
      hover: "hover:bg-indigo-500/[0.12]",
      text: "text-indigo-400",
    },
    {
      key: "easy",
      label: "Easy",
      sub: "7 days",
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/[0.06]",
      hover: "hover:bg-emerald-500/[0.12]",
      text: "text-emerald-400",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Flashcards</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={cardLang}
              onChange={(e) => handleLangChange(e.target.value)}
              disabled={translating}
              className="appearance-none rounded-lg border border-white/10 bg-white/5 py-1.5 pl-3 pr-7 text-xs text-slate-400 transition hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50"
            >
              {TRANSLATE_LANGS.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            {translating && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-violet-400 animate-pulse">
                ...
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAnalytics((s) => !s)}
            className={`rounded-lg p-1.5 transition ${
              showAnalytics
                ? "bg-violet-500/20 text-violet-400"
                : "text-slate-500 hover:text-white"
            }`}
            title="Toggle stats"
          >
            <ChartIcon />
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300">{dueCount} due</span>
            <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">{totalCount} total</span>
            {mistakeCount > 0 && (
              <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300">{mistakeCount} mistakes</span>
            )}
          </div>
        </div>
      </div>

      {/* Source lectures banner */}
      {sourceLectures.length > 1 && (
        <div className="mb-4 glass rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60 mb-1">
            Combined from {sourceLectures.length} lectures
          </p>
          <p className="text-xs text-slate-400 truncate">
            {sourceLectures.map((l) => l.title).join(", ")}
          </p>
        </div>
      )}

      {/* Ingest banner */}
      {ingestCount > 0 && (
        <p className="mb-4 glass rounded-xl px-4 py-3 text-sm text-violet-300/90">
          Added {ingestCount} card{ingestCount === 1 ? "" : "s"} from your
          latest study pack.
        </p>
      )}

      {/* Analytics panel */}
      {showAnalytics && analytics && (
        <div className="glass-strong mb-6 rounded-2xl p-5">
          <AnalyticsPanel analytics={analytics} onExport={handleExport} />
        </div>
      )}

      {/* Mode buttons */}
      <div className="mb-4 flex items-center gap-2">
        {modeButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={
              mode === key
                ? "btn-primary rounded-full px-4 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white transition"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter buttons */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filterButtons.map(({ key, label, textColor }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? "rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-violet-500/50"
                : `rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.06] transition ${textColor}`
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      {queue.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span>
              {doneMsg ? queue.length : pos} / {queue.length} reviewed
            </span>
            <span>{doneMsg ? 100 : progress}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${doneMsg ? 100 : progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main card area */}
      <div className="glass-strong rounded-2xl p-6">
        {queue.length === 0 || doneMsg ? (
          <div className="flex flex-col items-center py-12 text-center">
            {doneMsg ? (
              <>
                <p className="text-lg font-medium text-slate-300">
                  All caught up
                </p>
                <p className="mt-2 text-sm text-slate-500">{doneMsg}</p>
              </>
            ) : totalCount === 0 ? (
              <>
                <p className="text-lg font-medium text-slate-300">
                  No cards yet
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Generate a study pack or complete a quiz.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link
                    to="/"
                    className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold text-white"
                  >
                    Upload
                  </Link>
                  <Link
                    to="/library"
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
                  >
                    Library
                  </Link>
                  <Link
                    to="/quiz"
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
                  >
                    Quiz
                  </Link>
                </div>
              </>
            ) : mode === "due" ? (
              <>
                <p className="text-lg font-medium text-slate-300">
                  All caught up
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  No cards due. Switch to Browse or come back later.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-slate-300">
                  No matches
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Try a different filter.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Card meta */}
            <p className="mb-3 text-center text-xs text-slate-500">
              {card.source} · {card.difficulty} · {pos + 1}/{queue.length}
            </p>

            {/* Swipeable flip card */}
            <div
              className="flip-scene relative mx-auto max-w-lg cursor-pointer"
              onClick={handleFlipClick}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={swipeStyle}
            >
              {/* Swipe feedback overlay */}
              {Math.abs(swipeX) > 30 && (
                <div
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl"
                  style={{
                    background:
                      swipeX < 0
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(99,102,241,0.08)",
                  }}
                >
                  <span
                    className={`text-xl font-bold ${swipeX < 0 ? "text-rose-400" : "text-indigo-400"}`}
                    style={{
                      opacity: Math.min(1, Math.abs(swipeX) / 80),
                    }}
                  >
                    {swipeX < 0 ? "Again" : "Good"}
                  </span>
                </div>
              )}

              <div
                className={`flip-inner rounded-2xl shadow-lg shadow-black/20 ${flipped ? "is-flipped" : ""}`}
              >
                {/* Front face */}
                <div className="flip-face glass absolute inset-0 flex flex-col rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60">
                      Front
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(displayCard.front);
                      }}
                      className="rounded p-1 text-slate-500 transition hover:text-violet-400"
                      title="Listen"
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <p className="mt-4 flex-1 whitespace-pre-wrap text-base leading-relaxed text-white">
                    {displayCard.front}
                  </p>
                  <p className="mt-4 text-center text-xs text-slate-500">
                    {flipped ? "" : mode === "voice" ? "Speak your answer below" : "Tap or Space to flip"}
                  </p>
                </div>

                {/* Back face */}
                <div className="flip-face flip-back glass absolute inset-0 flex flex-col rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/60">
                      Back
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(displayCard.back);
                      }}
                      className="rounded p-1 text-slate-500 transition hover:text-indigo-400"
                      title="Listen"
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <p className="mt-4 flex-1 whitespace-pre-wrap text-base leading-relaxed text-slate-200">
                    {displayCard.back}
                  </p>
                  {mode === "due" && (
                    <p className="mt-4 text-center text-[10px] text-slate-600">
                      Swipe left = Again · Swipe right = Good
                    </p>
                  )}
                </div>
              </div>
            </div>

            {mode === "due" ? (
              <>
                {/* Rate buttons (Due mode only) */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {rateButtons.map(({ key, label, sub, border, bg, hover, text }) => (
                    <button
                      key={key}
                      disabled={!flipped}
                      onClick={() => handleRate(key)}
                      className={`rounded-xl border ${border} ${bg} px-3 py-3 text-left transition ${hover} ${!flipped ? "cursor-not-allowed opacity-20" : ""}`}
                    >
                      <span className={`block text-sm font-semibold ${text}`}>
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Undo button */}
                {showUndoBtn && (
                  <button
                    onClick={handleUndo}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-slate-500 transition hover:text-white"
                  >
                    <UndoIcon />
                    Undo last rating
                  </button>
                )}
              </>
            ) : mode === "voice" ? (
              /* Voice Recall controls */
              <div className="mt-4 space-y-4">
                {vrStep === "idle" && (
                  <button
                    onClick={vrReadFront}
                    className="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white"
                  >
                    Read question aloud
                  </button>
                )}

                {vrStep === "listening" && (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-xs text-slate-500">Listen, then record your answer</p>
                    {!vrRecording ? (
                      <button
                        onClick={vrStartRecording}
                        className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-violet-500/40 bg-violet-500/10 transition hover:bg-violet-500/20"
                        title="Start recording"
                      >
                        <MicIcon recording={false} />
                      </button>
                    ) : (
                      <button
                        onClick={vrStopRecording}
                        className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-500/60 bg-rose-500/20 animate-pulse"
                        title="Stop recording"
                      >
                        <MicIcon recording />
                      </button>
                    )}
                    <p className="text-[10px] text-slate-600">
                      {vrRecording ? "Recording... tap to stop" : "Tap mic to answer"}
                    </p>
                  </div>
                )}

                {vrStep === "processing" && (
                  <div className="py-4 text-center">
                    <p className="text-sm text-violet-400 animate-pulse">Transcribing your answer...</p>
                  </div>
                )}

                {vrStep === "result" && vrResult && (
                  <div className="space-y-3">
                    {/* Score display */}
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-center">
                        <p className={`text-3xl font-black ${
                          vrResult.score >= 80 ? "text-emerald-400" :
                          vrResult.score >= 60 ? "text-indigo-400" :
                          vrResult.score >= 40 ? "text-amber-400" : "text-rose-400"
                        }`}>
                          {vrResult.score}%
                        </p>
                        <p className="text-[10px] text-slate-500">match</p>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-semibold ${
                          vrResult.suggestion === "easy" ? "text-emerald-400" :
                          vrResult.suggestion === "good" ? "text-indigo-400" :
                          vrResult.suggestion === "hard" ? "text-amber-400" : "text-rose-400"
                        }`}>
                          {vrResult.suggestion === "easy" ? "Excellent!" :
                           vrResult.suggestion === "good" ? "Good recall" :
                           vrResult.suggestion === "hard" ? "Partial recall" : "Try again"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {vrResult.matchedWords}/{vrResult.totalWords} key words
                        </p>
                      </div>
                    </div>

                    {/* Your answer vs expected */}
                    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div>
                        <p className="text-[10px] font-medium text-slate-500">You said:</p>
                        <p className="text-sm text-slate-300">{vrTranscript || "(empty)"}</p>
                      </div>
                      <div className="border-t border-white/5 pt-2">
                        <p className="text-[10px] font-medium text-slate-500">Expected:</p>
                        <p className="text-sm text-slate-400">{card.back}</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={vrAcceptSuggestion}
                        className={`rounded-xl py-2.5 text-sm font-semibold text-white ${
                          vrResult.suggestion === "easy" ? "bg-emerald-600" :
                          vrResult.suggestion === "good" ? "bg-indigo-600" :
                          vrResult.suggestion === "hard" ? "bg-amber-600" : "bg-rose-600"
                        }`}
                      >
                        Accept: {vrResult.suggestion.charAt(0).toUpperCase() + vrResult.suggestion.slice(1)}
                      </button>
                      <button
                        onClick={vrSkip}
                        className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
                      >
                        Skip
                      </button>
                    </div>

                    {/* Override with manual rating */}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] text-slate-600">Override:</span>
                      {["again", "hard", "good", "easy"].map((r) => (
                        <button
                          key={r}
                          onClick={() => { handleRate(r); vrReset(); }}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-500 transition hover:bg-white/10 hover:text-white"
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    {/* Try again */}
                    <button
                      onClick={() => { setVrStep("listening"); setVrTranscript(""); setVrResult(null); }}
                      className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition"
                    >
                      Record again
                    </button>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <button
                    disabled={pos <= 0}
                    onClick={() => { vrReset(); setPos((p) => p - 1); }}
                    className={`text-xs text-slate-500 hover:text-white transition ${pos <= 0 ? "opacity-30 cursor-not-allowed" : ""}`}
                  >
                    Prev
                  </button>
                  <span className="text-[10px] text-slate-600">{pos + 1} / {queue.length}</span>
                  <button
                    disabled={pos >= queue.length - 1}
                    onClick={() => { vrReset(); setPos((p) => p + 1); }}
                    className={`text-xs text-slate-500 hover:text-white transition ${pos >= queue.length - 1 ? "opacity-30 cursor-not-allowed" : ""}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              /* Browse navigation */
              <div className="mt-4 flex items-center justify-between">
                <button
                  disabled={pos <= 0}
                  onClick={() => { setPos((p) => p - 1); setFlipped(false); }}
                  className={`rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 ${pos <= 0 ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  Prev
                </button>
                <span className="text-xs text-slate-500">
                  {pos + 1} / {queue.length}
                </span>
                <button
                  disabled={pos >= queue.length - 1}
                  onClick={() => { setPos((p) => p + 1); setFlipped(false); }}
                  className={`rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 ${pos >= queue.length - 1 ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-slate-600">
        Intervals: Again 10m · Hard 24h · Good 3d · Easy 7d
      </p>
    </div>
  );
}
