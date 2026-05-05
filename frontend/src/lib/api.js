export const API_BASE = import.meta.env.VITE_API_BASE || "";

export const PIPELINE_STEPS = [
  { phase: "splitting", icon: "\u2702", label: "Split" },
  { phase: "transcribe", icon: "\uD83C\uDFA4", label: "Transcribe" },
  { phase: "clarify", icon: "\u270F", label: "Clarify" },
  { phase: "summary_quiz", icon: "\u26A1", label: "Generate" },
  { phase: "translate", icon: "\uD83C\uDF10", label: "Translate" },
  { phase: "done", icon: "\u2713", label: "Done" },
];

export const PHASE_PROGRESS = {
  splitting: 5,
  transcribe: 10,
  clarify: 55,
  summary_quiz: 70,
  translate: 85,
  done: 100,
};

export function parseChunkInfo(label) {
  const m = label.match(/chunk\s+(\d+)\s*\/\s*(\d+)/i);
  if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  const m2 = label.match(/(\d+)\s+chunks?\s+in\s+parallel/i);
  if (m2) return { current: 0, total: parseInt(m2[1], 10) };
  return null;
}

export async function consumeSSE(response, { onPhase, onComplete, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const block of chunks) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (msg.type === "phase") onPhase(msg.phase, msg.label);
      else if (msg.type === "complete") onComplete(msg.payload);
      else if (msg.type === "error") onError(msg);
    }
  }
}

// ── Lecture library API ──────────────────────────────────────────────

export async function fetchLectures() {
  const res = await fetch(`${API_BASE}/lectures`);
  if (!res.ok) throw new Error(`Failed to fetch lectures: ${res.status}`);
  return res.json();
}

export async function fetchLecture(id) {
  const res = await fetch(`${API_BASE}/lectures/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch lecture: ${res.status}`);
  return res.json();
}

export async function deleteLecture(id) {
  const res = await fetch(`${API_BASE}/lectures/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete lecture: ${res.status}`);
  return res.json();
}

export async function renameLecture(id, title) {
  const res = await fetch(`${API_BASE}/lectures/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename lecture: ${res.status}`);
  return res.json();
}

export async function combineLectures(lectureIds, options = {}) {
  const res = await fetch(`${API_BASE}/lectures/combine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lecture_ids: lectureIds,
      include_quiz: options.includeQuiz ?? true,
      include_flashcards: options.includeFlashcards ?? true,
    }),
  });
  if (!res.ok) throw new Error(`Failed to combine lectures: ${res.status}`);
  return res.json();
}

export async function generateMore(lectureId, type) {
  const res = await fetch(`${API_BASE}/lectures/${lectureId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error(`Failed to generate more: ${res.status}`);
  return res.json();
}

export async function transcribeVoice(audioBlob, language = "english") {
  const form = new FormData();
  form.append("audio", audioBlob, "voice.webm");
  form.append("language", language);
  const res = await fetch(`${API_BASE}/transcribe-voice`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Transcribe failed: ${res.status}`);
  }
  const data = await res.json();
  return data.text;
}

export async function translateBatch(texts, targetLang) {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, target_language: targetLang }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Translate failed: ${res.status}`);
  }
  const data = await res.json();
  return data.translations;
}
