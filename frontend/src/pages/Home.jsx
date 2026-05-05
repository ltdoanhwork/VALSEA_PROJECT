import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  API_BASE,
  PIPELINE_STEPS,
  PHASE_PROGRESS,
  parseChunkInfo,
  consumeSSE,
  translateBatch,
} from "../lib/api";
import { SESSION_KEY } from "../lib/studyDeck";

const TRANSCRIPTION_LANGS = [
  "english",
  "vietnamese",
  "thai",
  "indonesian",
  "malay",
  "filipino",
  "singlish",
  "chinese",
];

const TARGET_LANGS = [
  "vietnamese",
  "thai",
  "indonesian",
  "malay",
  "filipino",
  "english",
];

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

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

const TABS = [
  { key: "transcript", label: "Transcript" },
  { key: "summary", label: "Summary" },
  { key: "quiz", label: "Quiz" },
  { key: "flashcards", label: "Flashcards" },
];

const TIER_STYLES = {
  easy: "border-emerald-500/20 bg-emerald-500/[0.03]",
  medium: "border-amber-500/20 bg-amber-500/[0.03]",
  hard: "border-rose-500/20 bg-rose-500/[0.03]",
};

const TIER_BADGES = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-rose-400",
};

function LanguagePicker({ current, onChange, translating, originalLang }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
        <span className="text-sm select-none">🌐</span>
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={translating}
          className="bg-transparent text-xs text-slate-300 focus:outline-none disabled:opacity-50 cursor-pointer"
        >
          {TRANSLATE_LANGS.map((l) => (
            <option key={l.code} value={l.code} className="bg-slate-900 text-slate-300">
              {l.code === "original"
                ? `Original (${capitalize(originalLang)})`
                : l.label}
            </option>
          ))}
        </select>
      </div>
      {current !== "original" && !translating && (
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
          Translated
        </span>
      )}
      {translating && (
        <span className="flex items-center gap-1.5 text-xs text-violet-400 animate-pulse">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Translating…
        </span>
      )}
    </div>
  );
}

function TranslatingOverlay() {
  return (
    <div className="glass rounded-2xl p-6 flex items-center gap-2 text-violet-400 text-sm animate-pulse">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Translating…
    </div>
  );
}

function StepDots({ seenPhases, activePhase }) {
  return (
    <div className="flex items-center">
      {PIPELINE_STEPS.map((step, i) => {
        const done = seenPhases.has(step.phase) && step.phase !== activePhase;
        const active = step.phase === activePhase;
        const prevDone = i > 0 && seenPhases.has(PIPELINE_STEPS[i - 1].phase);

        let dotCls =
          "flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition-all duration-300";
        if (done) dotCls += " border-emerald-500/60 bg-emerald-500/10 text-emerald-400";
        else if (active)
          dotCls += " border-violet-500 bg-violet-500/20 text-violet-300 scale-110 ring-2 ring-violet-500/30";
        else dotCls += " border-white/10 bg-white/[0.04] text-slate-600";

        return (
          <div key={step.phase} className="flex items-center" style={i > 0 ? { flex: "1 1 0" } : undefined}>
            {i > 0 && (
              <div
                className={`h-px w-full transition-colors duration-300 ${
                  done || (active && prevDone) ? "bg-emerald-500/40" : "bg-white/10"
                }`}
              />
            )}
            <div className={dotCls} title={step.label}>
              {step.icon}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressSection({ progress }) {
  if (!progress.visible) return null;
  const { pct, label, chunks, seenPhases, activePhase } = progress;
  const isDone = pct >= 100;

  return (
    <div className="glass mt-6 rounded-2xl p-5 space-y-4">
      {/* Step indicator dots */}
      <StepDots seenPhases={seenPhases} activePhase={activePhase} />

      {/* Main progress bar + percentage */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              isDone
                ? "bg-gradient-to-r from-emerald-500 to-green-400"
                : "bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-600 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`w-10 text-right text-xs font-mono font-semibold ${isDone ? "text-emerald-400" : "text-violet-400"}`}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Current step label */}
      <p className="text-sm text-slate-400">{label}</p>

      {/* Chunk sub-progress (only during chunked transcription) */}
      {chunks && chunks.total > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Chunks</span>
            <span className="font-mono">{chunks.current} / {chunks.total}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-indigo-500/60 transition-[width] duration-300"
              style={{ width: `${(chunks.current / chunks.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptPanel({ transcript, glossary }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [highlightTerms, setHighlightTerms] = useState(true);

  const text = transcript || "";
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readingMin = Math.max(1, Math.ceil(wordCount / 200));

  const termRegex = (() => {
    if (!highlightTerms || !glossary?.length) return null;
    const phrases = glossary
      .map((g) => g.term)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return phrases.length ? new RegExp(`(${phrases.join("|")})`, "gi") : null;
  })();

  const searchRegex = (() => {
    const q = search.trim();
    if (!q) return null;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(${escaped})`, "gi");
  })();

  const searchCount = searchRegex
    ? (text.match(searchRegex) || []).length
    : 0;

  function renderHighlighted(raw) {
    let html = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (termRegex) {
      html = html.replace(
        termRegex,
        '<mark class="bg-violet-500/25 text-violet-200 px-0.5 rounded-sm">$1</mark>',
      );
    }
    if (searchRegex) {
      html = html.replace(
        searchRegex,
        '<mark class="bg-amber-400/30 text-amber-200 px-0.5 rounded-sm ring-1 ring-amber-400/40">$1</mark>',
      );
    }
    return html;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        {/* Stats */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>{wordCount.toLocaleString()} words</span>
          <span className="h-3 w-px bg-white/10" />
          <span>~{readingMin} min read</span>
          {paragraphs.length > 1 && (
            <>
              <span className="h-3 w-px bg-white/10" />
              <span>{paragraphs.length} paragraphs</span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Term toggle */}
          {glossary?.length > 0 && (
            <button
              onClick={() => setHighlightTerms((v) => !v)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                highlightTerms
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-white/5 text-slate-500 hover:text-slate-300"
              }`}
              title="Toggle keyword highlighting"
            >
              {highlightTerms ? "Keywords ON" : "Keywords OFF"}
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-36 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 pl-7 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            />
            <svg className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            {search && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                {searchCount}
              </span>
            )}
          </div>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            title="Copy transcript"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Transcript body */}
      <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No transcript available.</p>
        ) : paragraphs.length === 1 ? (
          <p
            className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300"
            dangerouslySetInnerHTML={{ __html: renderHighlighted(paragraphs[0]) }}
          />
        ) : (
          <div className="space-y-0">
            {paragraphs.map((p, i) => (
              <div key={i} className="group flex gap-4 py-2.5 border-b border-white/[0.03] last:border-0">
                <span className="flex-shrink-0 w-7 pt-0.5 text-right text-[11px] font-mono text-slate-600 select-none group-hover:text-violet-400/60 transition">
                  {i + 1}
                </span>
                <p
                  className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300"
                  dangerouslySetInnerHTML={{ __html: renderHighlighted(p) }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryPanel({ summaryEn, summaryLocal }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="glass rounded-2xl p-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-400/70">
          English
        </h3>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
          {summaryEn}
        </pre>
      </div>
      <div className="glass rounded-2xl p-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-400/70">
          Local language
        </h3>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
          {summaryLocal}
        </pre>
      </div>
    </div>
  );
}

function QuizPanel({ quiz, quizError }) {
  const [revealed, setRevealed] = useState({});

  if (quizError) return <p className="text-rose-400 text-sm">{quizError}</p>;
  if (!quiz?.length) return <p className="text-slate-500 text-sm">No quiz generated.</p>;

  return (
    <div className="space-y-4">
      {quiz.map((q, qi) => (
        <div key={qi} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <p className="mb-3 text-sm font-medium text-slate-200">
            {qi + 1}. {q.question}
          </p>
          <div className="space-y-2">
            {Object.entries(q.options).map(([key, val]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="radio"
                  name={`q-${qi}`}
                  className="mt-0.5 accent-violet-400"
                  disabled={revealed[qi]}
                />
                <span>
                  <span className="font-medium text-slate-400">{key}.</span> {val}
                </span>
              </label>
            ))}
          </div>
          {!revealed[qi] ? (
            <button
              className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 text-slate-300 transition"
              onClick={() => setRevealed((r) => ({ ...r, [qi]: true }))}
            >
              Reveal answer
            </button>
          ) : (
            <p className="mt-3 text-xs text-green-400">
              Answer: <span className="font-semibold">{q.answer}</span>
              {q.explain && <span className="ml-2 text-slate-400">— {q.explain}</span>}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function FlashcardsPanel({ flashcards, flashcardsError }) {
  if (flashcardsError)
    return <p className="text-rose-400 text-sm">{flashcardsError}</p>;
  if (!flashcards?.length)
    return <p className="text-slate-500 text-sm">No flashcards generated.</p>;

  const grouped = { easy: [], medium: [], hard: [] };
  flashcards.forEach((c) => {
    const d = (c.difficulty || "medium").toLowerCase();
    (grouped[d] || grouped.medium).push(c);
  });

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(
        ([tier, cards]) =>
          cards.length > 0 && (
            <div key={tier}>
              <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wide ${TIER_BADGES[tier]}`}>
                {tier} ({cards.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {cards.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 ${TIER_STYLES[tier]}`}
                  >
                    <p className="text-sm font-medium text-slate-200">{c.front}</p>
                    <p className="mt-2 text-xs text-slate-400">{c.back}</p>
                  </div>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState({ msg: "", error: false });
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({
    visible: false,
    pct: 0,
    label: "",
    activePhase: null,
    seenPhases: new Set(),
    chunks: null,
  });
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("transcript");
  const abortRef = useRef(null);

  const [contentLangs, setContentLangs] = useState({
    transcript: "original",
    summary: "original",
    quiz: "original",
    flashcards: "original",
  });
  const [translatingTabs, setTranslatingTabs] = useState({});
  const translationCacheRef = useRef({});

  function handlePhase(phase, label) {
    setProgress((prev) => {
      const seen = new Set(prev.seenPhases);
      seen.add(phase);

      if (phase === "splitting") {
        return { ...prev, visible: true, seenPhases: seen, activePhase: phase, pct: 5, label, chunks: null };
      }

      if (phase === "transcribe") {
        const info = parseChunkInfo(label);
        if (info) {
          const frac = info.total > 0 ? info.current / info.total : 0;
          const pct = 10 + frac * 45;
          return { ...prev, visible: true, seenPhases: seen, activePhase: phase, pct, label, chunks: info };
        }
        return { ...prev, visible: true, seenPhases: seen, activePhase: phase, pct: 10, label, chunks: null };
      }

      return {
        ...prev,
        visible: true,
        seenPhases: seen,
        activePhase: phase,
        pct: PHASE_PROGRESS[phase] ?? prev.pct,
        label,
        chunks: null,
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ msg: "", error: false });
    setResults(null);
    setSubmitting(true);
    setContentLangs({ transcript: "original", summary: "original", quiz: "original", flashcards: "original" });
    setTranslatingTabs({});
    translationCacheRef.current = {};
    setProgress({ visible: true, pct: 0, label: "Starting…", activePhase: null, seenPhases: new Set(), chunks: null });

    const form = e.target;
    const fd = new FormData(form);
    if (fd.has("file") && !fd.has("audio")) {
      fd.set("audio", fd.get("file"));
      fd.delete("file");
    }
    fd.set("stream", "true");
    const filename = fd.get("audio")?.name || "upload";

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/process`, {
        method: "POST",
        body: fd,
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }

      const ct = res.headers.get("content-type") || "";

      if (ct.includes("text/event-stream")) {
        await consumeSSE(res, {
          onPhase: handlePhase,
          onComplete: (payload) => {
            const quiz = payload.quiz ?? [];
            const flashcards = payload.flashcards ?? [];

            const bundle = {
              title: `${filename} — quiz`,
              subtitle: `${quiz.length} questions from your run`,
              questions: quiz,
              quiz_error: null,
              flashcards,
              flashcards_error: null,
              source: "live",
              lecture_id: payload.lecture_id ?? null,
            };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));

            setResults({
              transcript: payload.transcript ?? "",
              summary_en: payload.summary_en ?? "",
              summary_local: payload.summary_local ?? "",
              summary: payload.summary || {},
              quiz,
              flashcards,
              quiz_error: payload.quiz_error ?? null,
              flashcards_error: payload.flashcards_error ?? null,
              meta: payload.meta || {},
              lecture_id: payload.lecture_id ?? null,
            });
            setProgress((p) => ({ ...p, pct: 100, label: "Done!", activePhase: "done", seenPhases: new Set([...p.seenPhases, "done"]) }));
            setStatus({ msg: "Pipeline complete! Lecture saved to Library.", error: false });
          },
          onError: (msg) => {
            setStatus({ msg: msg.detail || "Pipeline error", error: true });
          },
        });
      } else {
        const payload = await res.json();
        setResults({
          transcript: payload.transcript ?? "",
          summary_en: payload.summary_en ?? "",
          summary_local: payload.summary_local ?? "",
          summary: payload.summary || {},
          quiz: payload.quiz ?? [],
          flashcards: payload.flashcards ?? [],
          quiz_error: payload.quiz_error ?? null,
          flashcards_error: payload.flashcards_error ?? null,
          meta: payload.meta || {},
          lecture_id: payload.lecture_id ?? null,
        });
        setProgress((p) => ({ ...p, pct: 100, label: "Done!", activePhase: "done" }));
        setStatus({ msg: "Pipeline complete! Lecture saved to Library.", error: false });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setStatus({ msg: err.message, error: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLangChange(tabKey, langCode) {
    if (langCode === contentLangs[tabKey]) return;

    if (langCode === "original") {
      setContentLangs((prev) => ({ ...prev, [tabKey]: "original" }));
      return;
    }

    const cacheKey = `${tabKey}:${langCode}`;
    if (translationCacheRef.current[cacheKey]) {
      setContentLangs((prev) => ({ ...prev, [tabKey]: langCode }));
      return;
    }

    // Shortcut: if selecting the pipeline's target_language for summary, use existing local version
    if (tabKey === "summary" && langCode === results.meta?.target_language) {
      translationCacheRef.current[cacheKey] = results.summary_local;
      setContentLangs((prev) => ({ ...prev, [tabKey]: langCode }));
      return;
    }

    setTranslatingTabs((prev) => ({ ...prev, [tabKey]: true }));
    try {
      let translated;
      if (tabKey === "transcript") {
        const out = await translateBatch([results.transcript], langCode);
        translated = out[0];
      } else if (tabKey === "summary") {
        const out = await translateBatch([results.summary_en], langCode);
        translated = out[0];
      } else if (tabKey === "quiz") {
        translated = await translateQuizItems(results.quiz, langCode);
      } else if (tabKey === "flashcards") {
        translated = await translateFlashcardItems(results.flashcards, langCode);
      }
      translationCacheRef.current[cacheKey] = translated;
      setContentLangs((prev) => ({ ...prev, [tabKey]: langCode }));
    } catch (err) {
      console.error("Translation failed:", err);
      setStatus({ msg: `Translation failed: ${err.message}`, error: true });
    } finally {
      setTranslatingTabs((prev) => ({ ...prev, [tabKey]: false }));
    }
  }

  async function translateQuizItems(quiz, targetLang) {
    if (!quiz?.length) return [];
    const texts = [];
    const optKeys = ["A", "B", "C", "D"];
    quiz.forEach((q) => {
      texts.push(q.question);
      optKeys.forEach((k) => texts.push(q.options[k] || ""));
      texts.push(q.explain || "");
    });
    const out = await translateBatch(texts, targetLang);
    let i = 0;
    return quiz.map((q) => ({
      ...q,
      question: out[i++],
      options: Object.fromEntries(optKeys.map((k) => [k, out[i++]])),
      explain: out[i++],
    }));
  }

  async function translateFlashcardItems(cards, targetLang) {
    if (!cards?.length) return [];
    const texts = [];
    cards.forEach((c) => {
      texts.push(c.front);
      texts.push(c.back);
    });
    const out = await translateBatch(texts, targetLang);
    let i = 0;
    return cards.map((c) => ({
      ...c,
      front: out[i++],
      back: out[i++],
    }));
  }

  function displayed(tabKey) {
    const lang = contentLangs[tabKey];
    if (lang === "original") return null;
    return translationCacheRef.current[`${tabKey}:${lang}`];
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-600/40";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          From audio to study packs
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
          Upload a lecture recording — get a clean transcript, bilingual summary, quiz, and
          flashcards.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass-strong rounded-2xl p-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Audio file</label>
          <input
            type="file"
            name="audio"
            accept="audio/*"
            required
            className={`${inputCls} file:mr-3 file:bg-violet-600 file:text-white file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-xs file:cursor-pointer`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Transcription language
            </label>
            <select name="transcription_language" className={inputCls} defaultValue="english">
              {TRANSCRIPTION_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Target language
            </label>
            <select name="target_language" className={inputCls} defaultValue="vietnamese">
              {TARGET_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 transition"
        >
          {submitting ? "Processing…" : "Upload & process"}
        </button>

        {status.msg && (
          <div className="flex items-center gap-3">
            <p className={`text-xs ${status.error ? "text-rose-400" : "text-green-400"}`}>
              {status.msg}
            </p>
            {!status.error && results?.lecture_id && (
              <Link to="/library" className="text-xs font-medium text-violet-400 hover:text-violet-300">
                View in Library
              </Link>
            )}
          </div>
        )}
      </form>

      <ProgressSection progress={progress} />

      {results && (
        <div className="mt-8 space-y-5">
          <div className="flex gap-4 border-b border-white/10 pb-px">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "text-white border-b-2 border-violet-500"
                    : "text-slate-500 border-b-2 border-transparent hover:text-slate-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "transcript" && (
            <div className="space-y-3">
              <LanguagePicker
                current={contentLangs.transcript}
                onChange={(lang) => handleLangChange("transcript", lang)}
                translating={!!translatingTabs.transcript}
                originalLang={results.meta?.transcription_language || "english"}
              />
              {translatingTabs.transcript ? (
                <TranslatingOverlay />
              ) : (
                <TranscriptPanel
                  transcript={displayed("transcript") ?? results.transcript}
                  glossary={results.summary?.glossary}
                />
              )}
            </div>
          )}

          {tab === "summary" && (
            <div className="space-y-3">
              <LanguagePicker
                current={contentLangs.summary}
                onChange={(lang) => handleLangChange("summary", lang)}
                translating={!!translatingTabs.summary}
                originalLang="english"
              />
              {translatingTabs.summary ? (
                <TranslatingOverlay />
              ) : contentLangs.summary === "original" ? (
                <SummaryPanel summaryEn={results.summary_en} summaryLocal={results.summary_local} />
              ) : (
                <div className="glass rounded-2xl p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                    {displayed("summary")}
                  </pre>
                </div>
              )}
            </div>
          )}

          {tab === "quiz" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <LanguagePicker
                  current={contentLangs.quiz}
                  onChange={(lang) => handleLangChange("quiz", lang)}
                  translating={!!translatingTabs.quiz}
                  originalLang="english"
                />
                {results.quiz?.length > 0 && (
                  <Link
                    to="/quiz"
                    className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110"
                  >
                    <span>🎯</span> Start Quiz Mode
                  </Link>
                )}
              </div>
              {translatingTabs.quiz ? (
                <TranslatingOverlay />
              ) : (
                <QuizPanel
                  quiz={displayed("quiz") ?? results.quiz}
                  quizError={results.quiz_error}
                />
              )}
            </div>
          )}

          {tab === "flashcards" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <LanguagePicker
                  current={contentLangs.flashcards}
                  onChange={(lang) => handleLangChange("flashcards", lang)}
                  translating={!!translatingTabs.flashcards}
                  originalLang="english"
                />
                {results.flashcards?.length > 0 && (
                  <Link
                    to="/flashcards"
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-110"
                  >
                    <span>📇</span> Open Flashcard Deck
                  </Link>
                )}
              </div>
              {translatingTabs.flashcards ? (
                <TranslatingOverlay />
              ) : (
                <FlashcardsPanel
                  flashcards={displayed("flashcards") ?? results.flashcards}
                  flashcardsError={results.flashcards_error}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
