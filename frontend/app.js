/** Lecture2Quiz SEA — POST /process with SSE progress (`stream=true`). */
const API_BASE = "http://127.0.0.1:8001";
const STORAGE_KEY = "lecture2quiz_bundle";

const form = document.getElementById("upload-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const submitBtn = document.getElementById("submit-btn");
const transcriptText = document.getElementById("transcript-text");
const summaryEn = document.getElementById("summary-en");
const summaryLocal = document.getElementById("summary-local");
const quizList = document.getElementById("quiz-list");
const quizErrorEl = document.getElementById("quiz-error");
const flashcardsList = document.getElementById("flashcards-list");
const flashcardsErrorEl = document.getElementById("flashcards-error");
const progressPanel = document.getElementById("progress-panel");
const progressSteps = document.getElementById("progress-steps");

const tabBtns = document.querySelectorAll(".tab-btn");
const panels = {
  transcript: document.getElementById("panel-transcript"),
  summary: document.getElementById("panel-summary"),
  quiz: document.getElementById("panel-quiz"),
  flashcards: document.getElementById("panel-flashcards"),
};

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("hidden", !message);
  statusEl.classList.toggle("text-red-300", isError);
  statusEl.classList.toggle("text-amber-200", !isError && !!message);
}

function resetProgressUI() {
  progressSteps.innerHTML = "";
  progressPanel.classList.add("hidden");
}

function pushPhaseEntry(phase, label) {
  progressPanel.classList.remove("hidden");
  progressSteps.querySelectorAll("li .running-dot").forEach((el) => el.remove());
  const li = document.createElement("li");
  li.className = "leading-relaxed";
  li.innerHTML = `<span class="font-mono text-xs text-slate-500">${escapeHtml(phase)}</span><br/><span class="text-slate-200">${escapeHtml(label)}</span> <span class="running-dot text-sky-400 text-xs">… running</span>`;
  progressSteps.appendChild(li);
}

function finalizeProgressUI() {
  progressSteps.querySelectorAll(".running-dot").forEach((el) => {
    el.textContent = "done";
    el.classList.remove("text-sky-400");
    el.classList.add("text-emerald-400", "text-xs");
  });
}

function setActiveTab(name) {
  tabBtns.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("bg-white/10", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-slate-400", !active);
  });
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

function renderQuiz(questions) {
  quizList.innerHTML = "";
  if (!questions || questions.length === 0) {
    quizList.innerHTML =
      '<p class="text-slate-400 text-sm">No quiz items returned. Check GEMINI_API_KEY and quiz_error above.</p>';
    return;
  }

  questions.forEach((q, i) => {
    const wrap = document.createElement("div");
    wrap.className = "rounded-xl border border-white/10 bg-white/5 p-4";

    const title = document.createElement("p");
    title.className = "font-medium text-white";
    title.textContent = `${i + 1}. ${q.question}`;

    const opts = document.createElement("div");
    opts.className = "mt-3 space-y-2";

    ["A", "B", "C", "D"].forEach((letter) => {
      const row = document.createElement("label");
      row.className =
        "flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-sky-500/40 hover:bg-white/5";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q-${i}`;
      radio.value = letter;
      radio.className = "text-sky-500";

      const span = document.createElement("span");
      span.className = "text-sm text-slate-200";
      span.textContent = `${letter}. ${q.options?.[letter] ?? ""}`;

      row.appendChild(radio);
      row.appendChild(span);
      opts.appendChild(row);
    });

    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className =
      "mt-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600";
    reveal.textContent = "Reveal answer";
    reveal.addEventListener("click", () => {
      reveal.textContent = `Correct: ${q.answer}`;
      reveal.disabled = true;
      reveal.classList.add("opacity-70");
    });

    wrap.appendChild(title);
    wrap.appendChild(opts);
    wrap.appendChild(reveal);
    quizList.appendChild(wrap);
  });
}

function renderFlashcards(cards) {
  flashcardsList.innerHTML = "";
  if (!cards || cards.length === 0) {
    flashcardsList.innerHTML =
      '<p class="text-slate-400 text-sm">No flashcards returned. Check GEMINI_API_KEY or flashcards_error above. For demos: set USE_MOCK_FLASHCARDS on the backend.</p>';
    return;
  }

  const tiers = [
    { key: "easy", label: "Easy — definitions & terms", className: "border-emerald-500/30 bg-emerald-500/5" },
    { key: "medium", label: "Medium — examples & comparisons", className: "border-amber-500/30 bg-amber-500/5" },
    { key: "hard", label: "Hard — why, apply, misconceptions", className: "border-orange-500/30 bg-orange-500/5" },
  ];

  tiers.forEach(({ key, label, className }) => {
    const chunk = cards.filter((c) => (c.difficulty || "medium").toLowerCase() === key);
    if (!chunk.length) return;

    const section = document.createElement("div");
    section.className = `rounded-xl border ${className} p-4`;

    const h = document.createElement("h3");
    h.className = "mb-3 text-xs font-bold uppercase tracking-wide text-slate-300";
    h.textContent = `${label} (${chunk.length})`;
    section.appendChild(h);

    chunk.forEach((c, i) => {
      const card = document.createElement("div");
      card.className = i ? "mt-3 border-t border-white/10 pt-3" : "";
      const type = c.card_type
        ? `<span class="text-[10px] uppercase text-slate-500">${escapeHtml(c.card_type)}</span>`
        : "";
      card.innerHTML = `
        <div class="flex flex-wrap items-baseline justify-between gap-2">${type}</div>
        <p class="mt-1 text-sm font-medium text-white">${escapeHtml(c.front)}</p>
        <p class="mt-2 text-sm text-slate-400">${escapeHtml(c.back)}</p>
      `;
      section.appendChild(card);
    });

    flashcardsList.appendChild(section);
  });
}

function applyResultPayload(data) {
  transcriptText.textContent = data.transcript ?? "";
  summaryEn.textContent = data.summary_en ?? "";
  summaryLocal.textContent = data.summary_local ?? "";

  if (data.quiz_error) {
    quizErrorEl.textContent = `Quiz: ${data.quiz_error}`;
    quizErrorEl.classList.remove("hidden");
  } else {
    quizErrorEl.classList.add("hidden");
  }

  if (data.flashcards_error) {
    flashcardsErrorEl.textContent = `Flashcards: ${data.flashcards_error}`;
    flashcardsErrorEl.classList.remove("hidden");
  } else {
    flashcardsErrorEl.classList.add("hidden");
  }

  renderQuiz(data.quiz);
  renderFlashcards(data.flashcards);

  try {
    const fname = data.meta && data.meta.filename ? String(data.meta.filename) : "lecture";
    const title = fname.replace(/\.[^/.]+$/, "");
    const bundle = {
      title: `${title} — quiz`,
      subtitle:
        Array.isArray(data.quiz) && data.quiz.length
          ? `${data.quiz.length} questions from your run`
          : "No API quiz — quiz room will load demo mock",
      questions: Array.isArray(data.quiz) ? data.quiz : [],
      quiz_error: data.quiz_error || null,
      flashcards: Array.isArray(data.flashcards) ? data.flashcards : [],
      flashcards_error: data.flashcards_error || null,
      source: "live",
      meta: data.meta || {},
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }

  resultsEl.classList.remove("hidden");
  setActiveTab("transcript");
}

/**
 * @param {Response} response
 * @param {(phase: string, label: string) => void} onPhase
 * @param {(payload: object) => void} onComplete
 * @param {(err: { detail?: string, status?: number }) => void} onError
 */
async function consumeSSE(response, onPhase, onComplete, onError) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const rawBlock of chunks) {
      const dataLine = rawBlock.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      let msg;
      try {
        msg = JSON.parse(jsonStr);
      } catch {
        continue;
      }
      if (msg.type === "phase") onPhase(msg.phase, msg.label);
      else if (msg.type === "complete") onComplete(msg.payload);
      else if (msg.type === "error") onError(msg);
    }
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showStatus("");
  quizErrorEl.classList.add("hidden");
  flashcardsErrorEl.classList.add("hidden");
  resultsEl.classList.add("hidden");
  resetProgressUI();

  const fd = new FormData(form);
  fd.set("stream", "true");

  submitBtn.disabled = true;
  showStatus("Connecting to backend…");

  try {
    const res = await fetch(`${API_BASE}/process`, {
      method: "POST",
      body: fd,
    });

    const ct = res.headers.get("content-type") || "";

    if (ct.includes("text/event-stream")) {
      if (!res.ok) {
        showStatus(`Stream failed: HTTP ${res.status}`, true);
        return;
      }
      await consumeSSE(
        res,
        (_phase, label) => {
          pushPhaseEntry(_phase, label);
          showStatus(label, false);
        },
        (payload) => {
          finalizeProgressUI();
          applyResultPayload(payload);
          showStatus("Done.");
        },
        (err) => {
          finalizeProgressUI();
          const detail = err.detail ?? JSON.stringify(err);
          showStatus(typeof detail === "string" ? detail : JSON.stringify(detail), true);
        },
      );
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail ?? res.statusText;
      showStatus(typeof detail === "string" ? detail : JSON.stringify(detail), true);
      return;
    }

    applyResultPayload(data);
    showStatus("Done.");
  } catch (err) {
    console.error(err);
    showStatus(
      `Cannot reach backend at ${API_BASE}. Start uvicorn from /backend — ${err.message}`,
      true,
    );
  } finally {
    submitBtn.disabled = false;
  }
});
