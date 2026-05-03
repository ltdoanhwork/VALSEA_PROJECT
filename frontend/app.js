/** Lecture2Quiz SEA — calls FastAPI `/process`. Change if backend runs elsewhere. */
const API_BASE = "http://127.0.0.1:8001";

const form = document.getElementById("upload-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const submitBtn = document.getElementById("submit-btn");
const transcriptText = document.getElementById("transcript-text");
const summaryEn = document.getElementById("summary-en");
const summaryLocal = document.getElementById("summary-local");
const quizList = document.getElementById("quiz-list");
const quizErrorEl = document.getElementById("quiz-error");

const tabBtns = document.querySelectorAll(".tab-btn");
const panels = {
  transcript: document.getElementById("panel-transcript"),
  summary: document.getElementById("panel-summary"),
  quiz: document.getElementById("panel-quiz"),
};

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("hidden", !message);
  statusEl.classList.toggle("text-red-300", isError);
  statusEl.classList.toggle("text-amber-200", !isError && !!message);
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showStatus("");
  quizErrorEl.classList.add("hidden");
  resultsEl.classList.add("hidden");

  const fd = new FormData(form);

  submitBtn.disabled = true;
  showStatus("Processing lecture… Valsea transcription + formatting may take a minute.");

  try {
    const res = await fetch(`${API_BASE}/process`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail ?? res.statusText;
      showStatus(typeof detail === "string" ? detail : JSON.stringify(detail), true);
      return;
    }

    transcriptText.textContent = data.transcript ?? "";
    summaryEn.textContent = data.summary_en ?? "";
    summaryLocal.textContent = data.summary_local ?? "";

    if (data.quiz_error) {
      quizErrorEl.textContent = `Quiz: ${data.quiz_error}`;
      quizErrorEl.classList.remove("hidden");
    } else {
      quizErrorEl.classList.add("hidden");
    }

    renderQuiz(data.quiz);

    resultsEl.classList.remove("hidden");
    setActiveTab("transcript");
    showStatus("Done.");
  } catch (err) {
    console.error(err);
    showStatus(
      `Cannot reach backend at ${API_BASE}. Start uvicorn from /backend and enable CORS — ${err.message}`,
      true,
    );
  } finally {
    submitBtn.disabled = false;
  }
});
