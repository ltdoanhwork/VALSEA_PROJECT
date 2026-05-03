/**
 * Shared SRS deck (localStorage) + ingest pipeline cards from sessionStorage bundle.
 * Exposes window.Lecture2StudyDeck for quiz-app.js and flashcards-app.js.
 */
(function (w) {
  const SRS_STORAGE = "lecture2srs_deck";
  /** Same key as quiz bundle — includes optional flashcards[] after /process */
  const SESSION_STUDY_KEY = "lecture2quiz_bundle";

  const SRS_MS = {
    again: 10 * 60 * 1000,
    hard: 24 * 60 * 60 * 1000,
    good: 3 * 24 * 60 * 60 * 1000,
    easy: 7 * 24 * 60 * 60 * 1000,
  };

  function hashId(s) {
    let h = 5381;
    const str = String(s);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return Math.abs(h >>> 0).toString(36);
  }

  function stableCardId(source, front, back) {
    return `${source}-${hashId(`${source}\n${front}\n${back}`)}`;
  }

  function loadDeck() {
    try {
      const raw = localStorage.getItem(SRS_STORAGE);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveDeck(deck) {
    localStorage.setItem(SRS_STORAGE, JSON.stringify(deck));
  }

  function upsertCards(newEntries) {
    const deck = loadDeck();
    const ids = new Set(deck.map((c) => c.id));
    let added = 0;
    for (const c of newEntries) {
      if (!c || !c.id) continue;
      if (ids.has(c.id)) continue;
      deck.push(c);
      ids.add(c.id);
      added++;
    }
    saveDeck(deck);
    return added;
  }

  function ingestPipelineCardsFromSession() {
    let bundle;
    try {
      const raw = sessionStorage.getItem(SESSION_STUDY_KEY);
      if (!raw) return 0;
      bundle = JSON.parse(raw);
    } catch {
      return 0;
    }
    const cards = bundle.flashcards;
    if (!Array.isArray(cards) || !cards.length) return 0;
    const now = Date.now();
    const tierOk = new Set(["easy", "medium", "hard"]);
    const entries = cards.map((c) => {
      const d = String(c.difficulty || "medium").toLowerCase();
      return {
        id: stableCardId("pipeline", c.front, c.back),
        front: String(c.front || ""),
        back: String(c.back || ""),
        difficulty: tierOk.has(d) ? d : "medium",
        card_type: String(c.card_type || ""),
        source: "pipeline",
        nextReviewAt: now,
        createdAt: now,
      };
    }).filter((c) => c.front && c.back);
    return upsertCards(entries);
  }

  /**
   * @param {Array<{question:string,picked:string,answer:string,options:object,explain?:string}>} mistakes
   */
  function mergeFromMistakes(mistakes) {
    const now = Date.now();
    const entries = (mistakes || []).map((m) => {
      const correctText = m.options[m.answer] ?? "";
      const pickedText = m.options[m.picked] ?? "";
      const front = `Why is (${m.answer}) "${correctText}" the right answer?\n\nQuestion: ${m.question}`;
      const explain = m.explain && String(m.explain).trim();
      const back =
        explain ||
        `Correct: (${m.answer}) ${correctText}. You chose (${m.picked}) ${pickedText}.`;
      return {
        id: stableCardId("mistake", front, back),
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

  function scheduleNext(cardId, rating) {
    const ms = SRS_MS[rating];
    if (ms == null) return null;
    const deck = loadDeck();
    const i = deck.findIndex((c) => c.id === cardId);
    if (i < 0) return null;
    deck[i].nextReviewAt = Date.now() + ms;
    deck[i].lastRated = rating;
    deck[i].lastRatedAt = Date.now();
    saveDeck(deck);
    return deck[i].nextReviewAt;
  }

  function clearDeck() {
    localStorage.removeItem(SRS_STORAGE);
  }

  w.Lecture2StudyDeck = {
    SRS_STORAGE,
    SESSION_STUDY_KEY,
    SRS_MS,
    loadDeck,
    saveDeck,
    stableCardId,
    ingestPipelineCardsFromSession,
    mergeFromMistakes,
    scheduleNext,
    clearDeck,
  };
})(typeof window !== "undefined" ? window : globalThis);
