/**
 * Flashcard room — due queue, flip UI, rule-based spaced repetition.
 */
const D = window.Lecture2StudyDeck;
if (!D) console.error("study-deck.js must load first");

const ingestBanner = document.getElementById("ingest-banner");
const statDue = document.getElementById("stat-due");
const statTotal = document.getElementById("stat-total");
const statMistakes = document.getElementById("stat-mistakes");
const emptyState = document.getElementById("empty-state");
const studyPanel = document.getElementById("study-panel");
const flipInner = document.getElementById("flip-inner");
const flipTrigger = document.getElementById("flip-trigger");
const cardFront = document.getElementById("card-front");
const cardBack = document.getElementById("card-back");
const cardMeta = document.getElementById("card-meta");
const cardDueHint = document.getElementById("card-due-hint");
const doneMsg = document.getElementById("done-msg");

let mode = "due";
let filter = "all";
/** @type {any[]} */
let activeQueue = [];
let queuePos = 0;
let flipped = false;

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function fmtRel(ms) {
  if (ms <= 0) return "due now";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.ceil(ms / 3600000);
  if (h < 48) return `in ${h} h`;
  const dNum = Math.ceil(ms / 86400000);
  return `in ${dNum} d`;
}

function fmtClock(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function passesFilter(card) {
  if (filter === "all") return true;
  if (filter === "mistake") return card.source === "mistake";
  return card.difficulty === filter;
}

function buildQueue() {
  const deck = D.loadDeck();
  const now = Date.now();
  let pool = deck.filter(passesFilter);
  if (mode === "due") {
    pool = pool.filter((c) => (c.nextReviewAt ?? 0) <= now).sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
  } else {
    pool = [...pool].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  return pool;
}

function updateStats() {
  const deck = D.loadDeck();
  const now = Date.now();
  const due = deck.filter((c) => passesFilter(c) && (c.nextReviewAt ?? 0) <= now).length;
  const mistakeN = deck.filter((c) => c.source === "mistake").length;
  statDue.textContent = `${due} due`;
  statTotal.textContent = `${deck.length} cards total`;
  statMistakes.textContent = mistakeN ? `${mistakeN} from quiz misses` : "No mistake cards yet";
}

function setModeButtons() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    const m = btn.dataset.mode;
    const on = m === mode;
    btn.classList.toggle("bg-teal-600", on);
    btn.classList.toggle("text-white", on);
    btn.classList.toggle("bg-white/10", !on);
    btn.classList.toggle("text-slate-300", !on);
  });
}

function setFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    const f = btn.dataset.filter;
    const on = f === filter;
    btn.classList.toggle("ring-2", on);
    btn.classList.toggle("ring-teal-400", on);
    btn.classList.toggle("bg-white/15", on && f === "all");
  });
}

function syncRateButtons() {
  const ok = !!(flipped && activeQueue[queuePos]);
  document.querySelectorAll(".rate-btn").forEach((btn) => {
    btn.disabled = !ok;
    btn.classList.toggle("opacity-45", !ok);
    btn.classList.toggle("cursor-not-allowed", !ok);
  });
}

function resetFlip() {
  flipped = false;
  flipInner.classList.remove("is-flipped");
  syncRateButtons();
}

function showCurrentCard() {
  doneMsg.classList.add("hidden");
  resetFlip();
  const card = activeQueue[queuePos];
  if (!card) return;

  emptyState.classList.add("hidden");
  studyPanel.classList.remove("hidden");
  cardFront.innerHTML = escapeHtml(card.front);
  cardBack.innerHTML = escapeHtml(card.back);

  const tier = card.difficulty || "medium";
  const src = card.source === "mistake" ? "Quiz miss" : "Lecture";
  const ctype = card.card_type ? ` · ${card.card_type.replace(/_/g, " ")}` : "";
  cardMeta.textContent = `${src} · ${tier}${ctype} · ${queuePos + 1}/${activeQueue.length}`;

  const dueMs = (card.nextReviewAt ?? 0) - Date.now();
  cardDueHint.textContent =
    mode === "browse"
      ? `Scheduled: ${fmtClock(card.nextReviewAt)} (${dueMs <= 0 ? "due now" : fmtRel(dueMs)})`
      : "";
  syncRateButtons();
}

function showEmptyQueueMessage() {
  studyPanel.classList.add("hidden");
  doneMsg.classList.add("hidden");
  const deck = D.loadDeck();
  const titleEl = emptyState.querySelector("p.text-lg");
  const subEl = emptyState.querySelector("p.mt-2");
  const actions = emptyState.querySelector(".mt-6");

  if (deck.length === 0) {
    emptyState.classList.remove("hidden");
    titleEl.textContent = "No cards in your deck yet.";
    subEl.textContent = "Generate a study pack (flashcards run with the pipeline) or finish a quiz with misses.";
    actions.classList.remove("hidden");
    return;
  }

  emptyState.classList.remove("hidden");
  actions.classList.add("hidden");
  if (mode === "due") {
    titleEl.textContent = "You're caught up — no matching cards are due right now.";
    subEl.textContent = "Switch to Browse all, change level filter, or come back after the next interval.";
  } else {
    titleEl.textContent = "No cards match this filter.";
    subEl.textContent = "Try All levels or From mistakes after you miss quiz questions.";
  }
}

function advanceOrFinish() {
  queuePos++;
  if (queuePos >= activeQueue.length) {
    studyPanel.classList.add("hidden");
    doneMsg.classList.remove("hidden");
    doneMsg.textContent =
      activeQueue.length > 0
        ? "Nice — you cleared this queue. Come back when cards are due again."
        : "";
    updateStats();
    return;
  }
  showCurrentCard();
  updateStats();
}

function startSession() {
  activeQueue = buildQueue();
  queuePos = 0;
  updateStats();
  if (activeQueue.length === 0) {
    showEmptyQueueMessage();
    return;
  }
  emptyState.classList.add("hidden");
  showCurrentCard();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode || "due";
    setModeButtons();
    startSession();
  });
});

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter || "all";
    setFilterButtons();
    startSession();
  });
});

flipTrigger.addEventListener("click", () => {
  if (!activeQueue[queuePos]) return;
  flipped = !flipped;
  flipInner.classList.toggle("is-flipped", flipped);
  syncRateButtons();
});

document.addEventListener("keydown", (e) => {
  if (!studyPanel.classList.contains("hidden") && activeQueue[queuePos]) {
    if (e.code === "Space") {
      e.preventDefault();
      flipTrigger.click();
    }
    if (flipped && ["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) {
      const map = { Digit1: "again", Digit2: "hard", Digit3: "good", Digit4: "easy" };
      const r = map[e.code];
      document.querySelector(`[data-rate="${r}"]`)?.dispatchEvent(new MouseEvent("click"));
    }
  }
});

document.querySelectorAll(".rate-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const card = activeQueue[queuePos];
    if (!card || !flipped) return;
    const rating = btn.dataset.rate;
    D.scheduleNext(card.id, rating);
    advanceOrFinish();
  });
});

(function init() {
  const added = D.ingestPipelineCardsFromSession();
  if (added > 0) {
    ingestBanner.textContent = `Added ${added} flashcard${added === 1 ? "" : "s"} from your latest study pack (Easy / Medium / Hard).`;
    ingestBanner.classList.remove("hidden");
  }

  setModeButtons();
  setFilterButtons();
  updateStats();
  startSession();
})();
