import { useState, useEffect, useRef, useCallback } from "react";
import { SESSION_KEY, mergeFromMistakes } from "../lib/studyDeck";
import { translateBatch } from "../lib/api";
import { Link } from "react-router-dom";

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

function Confetti({ trigger, short }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!trigger) return;
    const colors = ["#60a5fa", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#e879f9"];
    const n = short ? 22 : 46;
    const items = Array.from({ length: n }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[i % colors.length],
      dur: 1.2 + Math.random() * 1.4,
      delay: Math.random() * 0.25,
    }));
    setPieces(items);
    const t = setTimeout(() => setPieces([]), short ? 1400 : 2800);
    return () => clearTimeout(t);
  }, [trigger, short]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function Quiz() {
  const [screen, setScreen] = useState("intro");
  const [bundle, setBundle] = useState(null);
  const [idx, setIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState("");
  const [mistakes, setMistakes] = useState([]);
  const [startMs, setStartMs] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [quizLang, setQuizLang] = useState("original");
  const [translatingQuiz, setTranslatingQuiz] = useState(false);
  const [translatedQs, setTranslatedQs] = useState(null);
  const quizTranslationCache = useRef({});

  useEffect(() => {
    let b;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) b = JSON.parse(raw);
    } catch {}
    if (!b || !b.questions?.length) {
      fetch("/mock-quiz.json")
        .then((r) => r.json())
        .then(setBundle)
        .catch(() => {});
    } else {
      const qs = b.questions.filter((q) => q.question && q.options);
      setBundle({ ...b, questions: qs });
    }
  }, []);

  const handleQuizLangChange = useCallback(
    async (langCode) => {
      setQuizLang(langCode);
      if (langCode === "original" || !bundle?.questions?.length) {
        setTranslatedQs(null);
        return;
      }
      if (quizTranslationCache.current[langCode]) {
        setTranslatedQs(quizTranslationCache.current[langCode]);
        return;
      }
      setTranslatingQuiz(true);
      try {
        const texts = [];
        const optKeys = ["A", "B", "C", "D"];
        bundle.questions.forEach((q) => {
          texts.push(q.question);
          optKeys.forEach((k) => texts.push(q.options[k] || ""));
          texts.push(q.explain || "");
        });
        const out = await translateBatch(texts, langCode);
        let i = 0;
        const result = bundle.questions.map((q) => ({
          ...q,
          question: out[i++],
          options: Object.fromEntries(optKeys.map((k) => [k, out[i++]])),
          explain: out[i++],
        }));
        quizTranslationCache.current[langCode] = result;
        setTranslatedQs(result);
      } catch (err) {
        console.error("Quiz translation failed:", err);
        setQuizLang("original");
        setTranslatedQs(null);
      } finally {
        setTranslatingQuiz(false);
      }
    },
    [bundle],
  );

  useEffect(() => {
    if (screen !== "play") return;
    const id = setInterval(() => setElapsed(Date.now() - startMs), 333);
    return () => clearInterval(id);
  }, [screen, startMs]);

  const stateRef = useRef();
  stateRef.current = { screen, answered, idx, bundle };

  const startPlay = useCallback(() => {
    setIdx(0);
    setStreak(0);
    setBestStreak(0);
    setCorrect(0);
    setAnswered(false);
    setPicked("");
    setMistakes([]);
    setElapsed(0);
    setConfetti(0);
    setStartMs(Date.now());
    setScreen("play");
  }, []);

  const choose = useCallback(
    (letter) => {
      if (answered || !bundle) return;
      setAnswered(true);
      setPicked(letter);
      const q = bundle.questions[idx];
      if (letter === q.answer) {
        setCorrect((c) => c + 1);
        setStreak((s) => {
          const next = s + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
        setConfetti((c) => c + 1);
      } else {
        setStreak(0);
        setMistakes((prev) => [...prev, { ...q, picked: letter }]);
      }
    },
    [answered, bundle, idx],
  );

  const next = useCallback(() => {
    if (!bundle) return;
    if (idx + 1 < bundle.questions.length) {
      setIdx((i) => i + 1);
      setAnswered(false);
      setPicked("");
    } else {
      mergeFromMistakes(mistakes);
      setScreen("result");
    }
  }, [bundle, idx, mistakes]);

  useEffect(() => {
    function onKey(e) {
      const s = stateRef.current;
      if (s.screen === "intro" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startPlay();
        return;
      }
      if (s.screen !== "play") return;
      const letterMap = { Digit1: "A", Digit2: "B", Digit3: "C", Digit4: "D", KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D" };
      const letter = letterMap[e.code];
      if (letter && !s.answered) {
        e.preventDefault();
        choose(letter);
        return;
      }
      if ((e.code === "Enter" || e.code === "Space") && s.answered) {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startPlay, choose, next]);

  if (!bundle) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-slate-400">Loading quiz…</p>
      </div>
    );
  }

  const questions = translatedQs || bundle.questions;
  const originalQuestions = bundle.questions;
  const total = questions.length;
  const title = bundle.title || "Quiz";
  const subtitle = bundle.subtitle || "";
  const meta = bundle.meta || `${total} question${total !== 1 ? "s" : ""} · multiple choice`;

  const langSelector = (
    <div className="relative inline-block">
      <select
        value={quizLang}
        onChange={(e) => handleQuizLangChange(e.target.value)}
        disabled={translatingQuiz}
        className="appearance-none rounded-lg border border-white/10 bg-white/5 py-1.5 pl-3 pr-7 text-xs text-slate-400 transition hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50"
      >
        {TRANSLATE_LANGS.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      {translatingQuiz && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-violet-400 animate-pulse">
          ...
        </span>
      )}
    </div>
  );
  const sourceLectures = bundle.source_lectures || [];
  const isFromLibrary = bundle.source === "combined" || bundle.source === "library";

  if (screen === "intro") {
    return (
      <div className="text-center">
        <Confetti trigger={confetti} short />
        <div className="glass-strong mx-auto max-w-sm rounded-2xl p-10">
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-3 text-sm text-slate-400">{subtitle}</p>
          <p className="mt-3 text-xs text-slate-500">{meta}</p>
          {isFromLibrary && sourceLectures.length > 0 && (
            <div className="mt-4 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60 mb-1">
                {sourceLectures.length > 1 ? "Combined from" : "From"}
              </p>
              {sourceLectures.map((l) => (
                <p key={l.id} className="text-xs text-slate-400 truncate">{l.title}</p>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-center">{langSelector}</div>
          <button
            onClick={startPlay}
            className="btn-primary mt-4 w-full rounded-xl py-3.5 text-sm font-semibold text-white transition active:scale-[0.99]"
          >
            Start
          </button>
          <p className="mt-4 text-xs text-slate-500">
            Keys{" "}
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">1</kbd>–
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">4</kbd> to pick,{" "}
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">Enter</kbd> for next
          </p>
        </div>
      </div>
    );
  }

  if (screen === "play") {
    const q = questions[idx];
    const progress = ((idx + (answered ? 1 : 0)) / total) * 100;
    const isCorrect = picked === q.answer;
    const letters = ["A", "B", "C", "D"];

    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Confetti trigger={confetti} short />

        <div className="h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {idx + 1} / {total}
          </span>
          {langSelector}
          <span className={streak > 0 ? "text-emerald-400" : "text-slate-500"}>
            {streak > 0 ? `🔥 ${streak}` : "streak 0"}
          </span>
          <span>{fmtTime(elapsed)}</span>
        </div>

        <div className="glass-strong rounded-2xl p-6">
          {q._source_lecture && (
            <p className="mb-2 text-[10px] font-medium text-violet-400/60 truncate">{q._source_lecture}</p>
          )}
          <p className="text-lg font-semibold leading-relaxed text-white">{q.question}</p>
        </div>

        <div className="grid gap-3">
          {letters.map((L) => {
            let cls =
              "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-white/20 hover:bg-white/[0.08]";
            if (answered) {
              if (L === q.answer) {
                cls += " ring-1 ring-emerald-500 bg-emerald-500/10";
              } else if (L === picked && !isCorrect) {
                cls += " shake-once ring-1 ring-rose-500 bg-rose-500/10";
              } else {
                cls += " opacity-60";
              }
            }
            return (
              <button
                key={L}
                onClick={() => choose(L)}
                disabled={answered}
                className={cls}
              >
                <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-medium text-violet-400">
                  {L}
                </span>
                <span className="text-sm text-slate-300">{q.options[L]}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="glass rounded-xl p-4 text-sm">
            {isCorrect ? (
              <p className="font-semibold text-emerald-400">Correct</p>
            ) : (
              <p className="font-semibold text-rose-400">
                Incorrect — answer: ({q.answer}) {q.options[q.answer]}
              </p>
            )}
            {q.explain && <p className="mt-2 text-slate-400">{q.explain}</p>}
          </div>
        )}

        {answered && (
          <button
            onClick={next}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            {idx + 1 < total ? "Next" : "See results"}
          </button>
        )}
      </div>
    );
  }

  if (screen === "result") {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const label =
      pct >= 80
        ? "Outstanding"
        : pct >= 50
          ? "Solid — review the summary once more"
          : "Keep going — retry beats passive reading";
    const noMisses = mistakes.length === 0;

    if (noMisses && confetti === 0) {
      setTimeout(() => setConfetti((c) => c + 1), 100);
    }

    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <Confetti trigger={confetti} short={false} />

        <div className="glass-strong mx-auto max-w-sm rounded-2xl p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400/70">Complete</p>
          <p className="mt-4 text-5xl font-black text-white tabular-nums">{pct}%</p>
          <p className="mt-4 text-sm text-slate-400">{label}</p>

          <div className="mt-6 grid grid-cols-3 gap-4 text-center text-xs text-slate-400">
            <div>
              <p className="text-lg font-bold text-white">{correct}</p>
              <p>correct</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{bestStreak}</p>
              <p>best streak</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{fmtTime(elapsed)}</p>
              <p>time</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={startPlay}
              className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            >
              Retry
            </button>
            <Link
              to="/flashcards"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
            >
              Flashcards
            </Link>
            <Link
              to="/library"
              className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5"
            >
              Library
            </Link>
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3 text-left text-sm">
            <p className="text-slate-300">
              Added {mistakes.length} card{mistakes.length !== 1 ? "s" : ""} to your flashcard deck.
            </p>
            <Link to="/flashcards" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Open deck
            </Link>
          </div>
        )}

        <div className="space-y-3 text-left">
          <h2 className="text-sm font-semibold text-slate-300">Review misses</h2>
          {noMisses ? (
            <p className="text-sm text-emerald-400">No misses.</p>
          ) : (
            mistakes.map((m, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                <p className="font-medium text-white">{m.question}</p>
                <p className="mt-1 text-rose-400">
                  Your answer: ({m.picked}) {m.options[m.picked]}
                </p>
                <p className="mt-1 text-emerald-400">
                  Correct: ({m.answer}) {m.options[m.answer]}
                </p>
                {m.explain && <p className="mt-1 text-slate-500">{m.explain}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
