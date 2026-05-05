const SRS_STORAGE = "lecture2srs_deck";
export const SESSION_KEY = "lecture2quiz_bundle";
const HISTORY_KEY = "lecture2srs_history";
const THEME_KEY = "lecture2srs_theme";

const DAY_MS = 86_400_000;

const SRS_MS = {
  again: 10 * 60_000,
  hard: 24 * 3600_000,
  good: 3 * 24 * 3600_000,
  easy: 7 * 24 * 3600_000,
};

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h >>> 0).toString(36);
}

function cardId(source, front, back) {
  return `${source}-${hash(`${source}\n${front}\n${back}`)}`;
}

export function loadDeck() {
  try {
    const raw = localStorage.getItem(SRS_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDeck(deck) {
  localStorage.setItem(SRS_STORAGE, JSON.stringify(deck));
}

function upsertCards(entries) {
  const deck = loadDeck();
  const ids = new Set(deck.map((c) => c.id));
  let added = 0;
  for (const c of entries) {
    if (!c?.id || ids.has(c.id)) continue;
    deck.push(c);
    ids.add(c.id);
    added++;
  }
  saveDeck(deck);
  return added;
}

export function ingestPipelineCards() {
  let bundle;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return 0;
    bundle = JSON.parse(raw);
  } catch {
    return 0;
  }
  const cards = bundle.flashcards;
  if (!Array.isArray(cards) || !cards.length) return 0;

  const now = Date.now();
  const ok = new Set(["easy", "medium", "hard"]);
  const entries = cards
    .map((c) => {
      const d = String(c.difficulty || "medium").toLowerCase();
      return {
        id: cardId("pipeline", c.front, c.back),
        front: String(c.front || ""),
        back: String(c.back || ""),
        difficulty: ok.has(d) ? d : "medium",
        card_type: String(c.card_type || ""),
        source: "pipeline",
        nextReviewAt: now,
        createdAt: now,
      };
    })
    .filter((c) => c.front && c.back);
  return upsertCards(entries);
}

export function mergeFromMistakes(mistakes) {
  const now = Date.now();
  const entries = (mistakes || []).map((m) => {
    const correctText = m.options[m.answer] ?? "";
    const pickedText = m.options[m.picked] ?? "";
    const front = m.question;
    const explain = m.explain?.trim();
    const lines = [`Correct: (${m.answer}) ${correctText}`];
    if (explain) lines.push(explain);
    lines.push(`You chose: (${m.picked}) ${pickedText}`);
    const back = lines.join("\n\n");
    return {
      id: cardId("mistake", front, back),
      front,
      back,
      difficulty: "hard",
      card_type: "mistake_review",
      source: "mistake",
      nextReviewAt: now,
      createdAt: now,
    };
  });
  return upsertCards(entries);
}

export function scheduleNext(id, rating) {
  const ms = SRS_MS[rating];
  if (ms == null) return null;
  const deck = loadDeck();
  const i = deck.findIndex((c) => c.id === id);
  if (i < 0) return null;
  deck[i].nextReviewAt = Date.now() + ms;
  deck[i].lastRated = rating;
  deck[i].lastRatedAt = Date.now();
  saveDeck(deck);
  return deck[i].nextReviewAt;
}

/* ── Migrate legacy mistake cards ───────────────────────────── */

const MIGRATED_KEY = "lecture2srs_migrated_v1";

export function migrateLegacyMistakeCards() {
  if (localStorage.getItem(MIGRATED_KEY)) return 0;
  const deck = loadDeck();
  let count = 0;
  for (const card of deck) {
    if (card.source !== "mistake") continue;
    const match = card.front.match(
      /^Why is \([A-D]\) ".*?" the right answer\?\n\nQuestion: (.+)$/s,
    );
    if (match) {
      card.front = match[1];
      count++;
    }
  }
  if (count > 0) saveDeck(deck);
  localStorage.setItem(MIGRATED_KEY, "1");
  return count;
}

/* ── Review history ─────────────────────────────────────────── */

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function logReview(id, rating) {
  const history = loadHistory();
  history.push({ cardId: id, rating, ts: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/* ── Undo ───────────────────────────────────────────────────── */

let _undoStack = [];

export function pushUndo(id) {
  const deck = loadDeck();
  const card = deck.find((c) => c.id === id);
  if (!card) return;
  _undoStack.push({
    cardId: card.id,
    nextReviewAt: card.nextReviewAt,
    lastRated: card.lastRated,
    lastRatedAt: card.lastRatedAt,
  });
}

export function popUndo() {
  if (!_undoStack.length) return null;
  const prev = _undoStack.pop();
  const deck = loadDeck();
  const i = deck.findIndex((c) => c.id === prev.cardId);
  if (i >= 0) {
    deck[i].nextReviewAt = prev.nextReviewAt;
    deck[i].lastRated = prev.lastRated;
    deck[i].lastRatedAt = prev.lastRatedAt;
    saveDeck(deck);
  }
  const history = loadHistory();
  if (history.length && history[history.length - 1].cardId === prev.cardId) {
    history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
  return prev;
}

export function canUndo() {
  return _undoStack.length > 0;
}

/* ── Analytics ──────────────────────────────────────────────── */

export function getAnalytics() {
  const history = loadHistory();
  const deck = loadDeck();
  const now = Date.now();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const todayCount = history.filter((h) => h.ts >= todayMs).length;
  const correct = history.filter((h) => h.rating !== "again").length;
  const accuracy = history.length
    ? Math.round((correct / history.length) * 100)
    : 0;

  let streak = 0;
  for (let d = 0; d < 365; d++) {
    const ds = todayMs - d * DAY_MS;
    if (history.some((h) => h.ts >= ds && h.ts < ds + DAY_MS)) streak++;
    else break;
  }

  const countByDate = {};
  for (const h of history) {
    const key = new Date(h.ts).toISOString().slice(0, 10);
    countByDate[key] = (countByDate[key] || 0) + 1;
  }

  const endOfTomorrow = todayMs + 2 * DAY_MS;
  const endOfWeek = todayMs + 7 * DAY_MS;
  let dueNow = 0,
    byTomorrow = 0,
    byWeek = 0;
  for (const card of deck) {
    const due = card.nextReviewAt ?? 0;
    if (due <= now) dueNow++;
    if (due <= endOfTomorrow) byTomorrow++;
    if (due <= endOfWeek) byWeek++;
  }

  return {
    todayCount,
    totalReviews: history.length,
    streak,
    accuracy,
    heatMap: countByDate,
    forecast: { dueNow, byTomorrow, byWeek },
  };
}

/* ── Export ──────────────────────────────────────────────────── */

export function exportProgress(format) {
  const deck = loadDeck();
  const history = loadHistory();
  const data = { deck, history, exportedAt: new Date().toISOString() };

  if (format === "csv") {
    const esc = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
    let csv =
      "id,front,back,difficulty,source,card_type,nextReviewAt,lastRated,createdAt\n";
    for (const c of deck) {
      csv +=
        [
          c.id,
          esc(c.front),
          esc(c.back),
          c.difficulty,
          c.source,
          c.card_type,
          c.nextReviewAt || "",
          c.lastRated || "",
          c.createdAt || "",
        ].join(",") + "\n";
    }
    return csv;
  }

  return JSON.stringify(data, null, 2);
}

/* ── Theme ──────────────────────────────────────────────────── */

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme() {
  const theme = loadTheme();
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}
