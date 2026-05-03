/**
 * Lecture2Quiz SEA — full-screen interactive quiz room.
 * Loads sessionStorage `lecture2quiz_bundle` or falls back to ./mock-quiz.json
 */
const STORAGE_KEY = "lecture2quiz_bundle";

const introScreen = document.getElementById("screen-intro");
const playScreen = document.getElementById("screen-play");
const resultScreen = document.getElementById("screen-result");
const confettiLayer = document.getElementById("confetti-layer");

const introTitle = document.getElementById("intro-title");
const introSubtitle = document.getElementById("intro-subtitle");
const introMeta = document.getElementById("intro-meta");
const btnStart = document.getElementById("btn-start");

const progressBar = document.getElementById("progress-bar");
const streakEl = document.getElementById("streak");
const timerEl = document.getElementById("timer");
const qNumEl = document.getElementById("q-num");
const qTextEl = document.getElementById("q-text");
const optionsEl = document.getElementById("options-grid");
const feedbackEl = document.getElementById("feedback");
const btnNext = document.getElementById("btn-next");

const scoreEl = document.getElementById("score-percent");
const scoreLabel = document.getElementById("score-label");
const reviewEl = document.getElementById("review-list");
const btnRetry = document.getElementById("btn-retry");
const btnHome = document.getElementById("btn-home");
const deckCta = document.getElementById("deck-cta");
const deckCtaText = document.getElementById("deck-cta-text");

/** @type {{ title: string, subtitle?: string, questions: any[], source: string, quiz_error?: string|null }} */
let bundle = { title: "Quiz", questions: [], source: "demo" };

let idx = 0;
let streak = 0;
let bestStreak = 0;
let correctCount = 0;
let answered = false;
let picked = "";
let timerId = 0;
let startMs = 0;
/** @type {{ question: string, picked: string, answer: string, options: Record<string, string>, explain: string }[]} */
let mistakes = [];

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

async function loadBundle() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    } catch {
      /* demo fallback */
    }
  }
  const res = await fetch("./mock-quiz.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load mock-quiz.json");
  const data = await res.json();
  return {
    title: data.title || "Demo quiz",
    subtitle: data.subtitle || "",
    questions: data.questions || [],
    source: "demo-file",
    quiz_error: null,
  };
}

function normalizeQuestions(list) {
  return (list || []).filter((q) => q && q.question && q.options);
}

function setScreens(which) {
  introScreen.classList.toggle("hidden", which !== "intro");
  playScreen.classList.toggle("hidden", which !== "play");
  resultScreen.classList.toggle("hidden", which !== "result");
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function tickTimer() {
  timerEl.textContent = fmtTime(Date.now() - startMs);
}

function launchConfetti(short = false) {
  confettiLayer.innerHTML = "";
  const n = short ? 22 : 46;
  const colors = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#f472b6"];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.2 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.25}s`;
    confettiLayer.appendChild(p);
  }
  setTimeout(
    () => {
      confettiLayer.innerHTML = "";
    },
    short ? 1400 : 2800,
  );
}

function renderProgress() {
  const total = bundle.questions.length;
  const pct = total ? ((idx + (answered ? 1 : 0)) / total) * 100 : 0;
  progressBar.style.width = `${Math.min(100, pct)}%`;
  qNumEl.textContent = `Question ${idx + 1} / ${total}`;
}

function renderQuestion() {
  answered = false;
  picked = "";
  feedbackEl.classList.add("hidden");
  feedbackEl.innerHTML = "";
  btnNext.classList.add("hidden");
  optionsEl.innerHTML = "";

  const q = bundle.questions[idx];
  qTextEl.innerHTML = escapeHtml(q.question);

  ["A", "B", "C", "D"].forEach((letter, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.letter = letter;
    btn.className =
      "quiz-opt group relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left transition hover:border-sky-400/50 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-500";
    btn.innerHTML = `
      <span class="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-sea-950/80 text-sm font-bold text-sky-300 ring-1 ring-white/10">${letter}</span>
      <span class="block pl-11 text-sm leading-snug text-slate-100">${escapeHtml(q.options[letter] ?? "")}</span>
      <span class="mt-2 block pl-11 text-xs text-slate-500 opacity-0 transition group-hover:opacity-100">${i + 1} · key ${i + 1}</span>
    `;
    btn.addEventListener("click", () => choose(letter, btn));
    optionsEl.appendChild(btn);
  });

  renderProgress();
}

function choose(letter, btnEl) {
  if (answered) return;
  answered = true;
  picked = letter;
  const q = bundle.questions[idx];
  const ok = letter === q.answer;

  if (ok) {
    correctCount++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    streakEl.textContent = `Streak ×${streak}`;
    streakEl.classList.remove("text-slate-400");
    streakEl.classList.add("text-amber-300");
    btnEl.classList.add("ring-2", "ring-emerald-400", "bg-emerald-500/15");
    launchConfetti(true);
    feedbackEl.innerHTML = `<p class="font-semibold text-emerald-300">Nice — correct!</p>${q.explain ? `<p class="mt-2 text-sm text-slate-300">${escapeHtml(q.explain)}</p>` : ""}`;
  } else {
    streak = 0;
    streakEl.textContent = "Streak ×0";
    streakEl.classList.add("text-slate-400");
    streakEl.classList.remove("text-amber-300");
    mistakes.push({
      question: q.question,
      picked: letter,
      answer: q.answer,
      options: { ...(q.options || {}) },
      explain: q.explain ? String(q.explain) : "",
    });
    btnEl.classList.add("shake-once", "ring-2", "ring-rose-400", "bg-rose-500/10");
    [...optionsEl.children].forEach((el) => {
      if (el.dataset.letter === q.answer) {
        el.classList.add("ring-2", "ring-emerald-400", "bg-emerald-500/10");
      }
      el.classList.add("cursor-default", "opacity-80");
    });
    feedbackEl.innerHTML = `<p class="font-semibold text-rose-300">Not quite — answer was ${q.answer}.</p>${q.explain ? `<p class="mt-2 text-sm text-slate-300">${escapeHtml(q.explain)}</p>` : ""}`;
  }

  feedbackEl.classList.remove("hidden");
  btnNext.classList.remove("hidden");
  btnNext.textContent = idx + 1 >= bundle.questions.length ? "See results" : "Next question →";
  renderProgress();
}

function finishQuiz() {
  clearInterval(timerId);
  const total = bundle.questions.length;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  scoreEl.textContent = `${pct}%`;
  scoreLabel.textContent =
    pct >= 80
      ? "Outstanding — ready to teach this back to someone!"
      : pct >= 50
        ? "Solid — skim the summary once more."
        : "Keep going — retry beats passive reading.";

  reviewEl.innerHTML = "";
  if (mistakes.length === 0) {
    reviewEl.innerHTML = `<p class="text-emerald-300/90 text-sm">Zero misses. Chef’s kiss.</p>`;
    launchConfetti(false);
    if (deckCta) deckCta.classList.add("hidden");
  } else {
    mistakes.forEach((m) => {
      const row = document.createElement("div");
      row.className = "rounded-xl border border-white/10 bg-black/20 p-3 text-sm";
      row.innerHTML = `<p class="text-slate-200">${escapeHtml(m.question)}</p>
        <p class="mt-1 text-xs text-rose-300">You chose ${m.picked} · correct ${m.answer}</p>`;
      reviewEl.appendChild(row);
    });

    let added = 0;
    if (typeof window.Lecture2StudyDeck !== "undefined") {
      added = window.Lecture2StudyDeck.mergeFromMistakes(mistakes);
    }
    if (deckCta && deckCtaText) {
      deckCta.classList.remove("hidden");
      deckCtaText.textContent =
        added > 0
          ? `Every wrong answer becomes a personalized flashcard. Added ${added} new card${added === 1 ? "" : "s"} to your deck.`
          : "Those misses are linked below — open the deck to review (cards may already be saved).";
    }
  }

  setScreens("result");
}

function startPlay() {
  idx = 0;
  streak = 0;
  bestStreak = 0;
  correctCount = 0;
  mistakes = [];
  answered = false;
  if (deckCta) deckCta.classList.add("hidden");
  streakEl.textContent = "Streak ×0";
  startMs = Date.now();
  clearInterval(timerId);
  timerId = setInterval(tickTimer, 333);
  tickTimer();
  setScreens("play");
  renderQuestion();
}

btnStart.addEventListener("click", () => startPlay());

btnNext.addEventListener("click", () => {
  if (!answered) return;
  if (idx + 1 >= bundle.questions.length) {
    finishQuiz();
    return;
  }
  idx++;
  renderQuestion();
});

btnRetry.addEventListener("click", () => {
  startPlay();
});

document.addEventListener("keydown", (e) => {
  if (playScreen.classList.contains("hidden")) return;
  if (!answered) {
    const map = { Digit1: "A", Digit2: "B", Digit3: "C", Digit4: "D", KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D" };
    const letter = map[e.code];
    if (!letter) return;
    const btns = [...optionsEl.querySelectorAll("button[data-letter]")];
    const hit = btns.find((b) => b.dataset.letter === letter);
    if (hit) choose(letter, hit);
    return;
  }
  if (e.code === "Enter" || e.code === "Space") {
    e.preventDefault();
    btnNext.click();
  }
});

(async function init() {
  try {
    bundle = await loadBundle();
    bundle.questions = normalizeQuestions(bundle.questions);
    if (!bundle.questions.length) {
      introTitle.textContent = "No questions loaded";
      introSubtitle.textContent = "Open index.html, run a lecture, or add frontend/mock-quiz.json";
      btnStart.disabled = true;
      setScreens("intro");
      return;
    }

    introTitle.textContent = bundle.title;
    introSubtitle.textContent =
      bundle.subtitle ||
      (bundle.source === "demo-file" ? "Loaded demo mock pack" : "From your last lecture run");

    const bits = [`${bundle.questions.length} questions`, bundle.source === "live" ? "Live quiz data" : "Demo / fallback"];
    if (bundle.quiz_error) bits.push("Note: API quiz had an error — showing saved or demo set");
    introMeta.textContent = bits.join(" · ");

    setScreens("intro");
  } catch (err) {
    console.error(err);
    introTitle.textContent = "Could not load quiz";
    introSubtitle.textContent = String(err.message || err);
    btnStart.disabled = true;
  }
})();
