import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLectures,
  fetchLecture,
  deleteLecture,
  renameLecture,
  combineLectures,
  generateMore,
} from "../lib/api";
import { SESSION_KEY } from "../lib/studyDeck";

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CombineModal({ selected, lectures, onClose, onCombine }) {
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [includeFlashcards, setIncludeFlashcards] = useState(true);
  const [loading, setLoading] = useState(false);

  const selectedLectures = lectures.filter((l) => selected.has(l.id));
  const totalQuiz = selectedLectures.reduce((s, l) => s + (l.quiz_count || 0), 0);
  const totalFlash = selectedLectures.reduce((s, l) => s + (l.flashcard_count || 0), 0);

  async function handleCombine() {
    setLoading(true);
    try {
      await onCombine({ includeQuiz, includeFlashcards });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong mx-4 w-full max-w-md rounded-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white">Combine Lectures</h2>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Selected lectures ({selectedLectures.length})</p>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {selectedLectures.map((l) => (
              <div key={l.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                {l.title}
                <span className="ml-2 text-xs text-slate-500">
                  {l.quiz_count}Q / {l.flashcard_count}FC
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeQuiz}
              onChange={(e) => setIncludeQuiz(e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-sm text-slate-300">
              Include Quiz ({totalQuiz} questions)
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFlashcards}
              onChange={(e) => setIncludeFlashcards(e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-sm text-slate-300">
              Include Flashcards ({totalFlash} cards)
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCombine}
            disabled={loading || (!includeQuiz && !includeFlashcards)}
            className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <SpinnerIcon />}
            {loading ? "Combining..." : "Combine & Start"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ lecture, onClose, onGenerated }) {
  const [genType, setGenType] = useState("both");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await generateMore(lecture.id, genType);
      setResult(res);
      onGenerated();
    } catch (err) {
      setResult({ errors: { general: err.message } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong mx-4 w-full max-w-md rounded-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white">Generate More</h2>
        <p className="text-sm text-slate-400">
          Generate additional quiz/flashcards from <span className="text-white font-medium">{lecture.title}</span>
        </p>

        {!result && (
          <>
            <div className="space-y-2">
              {["both", "quiz", "flashcards"].map((t) => (
                <label key={t} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="genType"
                    value={t}
                    checked={genType === t}
                    onChange={() => setGenType(t)}
                    className="accent-violet-500"
                  />
                  <span className="text-sm text-slate-300 capitalize">{t === "both" ? "Quiz + Flashcards" : t}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <SpinnerIcon />}
                {loading ? "Generating..." : "Generate"}
              </button>
              <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/10">
                Cancel
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            {result.new_quiz?.length > 0 && (
              <p className="text-sm text-emerald-400">+ {result.new_quiz.length} new quiz questions</p>
            )}
            {result.new_flashcards?.length > 0 && (
              <p className="text-sm text-emerald-400">+ {result.new_flashcards.length} new flashcards</p>
            )}
            {result.errors && Object.keys(result.errors).length > 0 && (
              <p className="text-sm text-rose-400">{Object.values(result.errors).join(", ")}</p>
            )}
            <button onClick={onClose} className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [showCombine, setShowCombine] = useState(false);
  const [generateLecture, setGenerateLecture] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchLectures();
      setLectures(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = lectures.filter((l) =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.filename?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  }

  async function handleDelete(id) {
    try {
      await deleteLecture(id);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSelected() {
    for (const id of selected) {
      try { await deleteLecture(id); } catch {}
    }
    setSelected(new Set());
    await load();
  }

  async function handleRename(id) {
    if (!editTitle.trim()) return;
    try {
      await renameLecture(id, editTitle.trim());
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCombine({ includeQuiz, includeFlashcards }) {
    try {
      const result = await combineLectures([...selected], { includeQuiz, includeFlashcards });
      const bundle = {
        title: `Combined — ${result.source_lectures.map((l) => l.title).join(", ")}`,
        subtitle: `${result.quiz.length} questions, ${result.flashcards.length} flashcards`,
        questions: result.quiz,
        flashcards: result.flashcards,
        source: "combined",
        source_lectures: result.source_lectures,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
      setShowCombine(false);

      if (includeQuiz && result.quiz.length > 0) {
        navigate("/quiz");
      } else if (includeFlashcards && result.flashcards.length > 0) {
        navigate("/flashcards");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function openSingleQuiz(lecture) {
    try {
      const full = await fetchLecture(lecture.id);
      const bundle = {
        title: full.title,
        subtitle: `${(full.quiz || []).length} questions`,
        questions: full.quiz || [],
        flashcards: full.flashcards || [],
        source: "library",
        source_lectures: [{ id: full.id, title: full.title }],
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
      navigate("/quiz");
    } catch (err) {
      setError(err.message);
    }
  }

  async function openSingleFlashcards(lecture) {
    try {
      const full = await fetchLecture(lecture.id);
      const bundle = {
        title: full.title,
        subtitle: `${(full.flashcards || []).length} flashcards`,
        questions: full.quiz || [],
        flashcards: full.flashcards || [],
        source: "library",
        source_lectures: [{ id: full.id, title: full.title }],
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
      navigate("/flashcards");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <SpinnerIcon /> Loading lectures...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Library</h1>
        <p className="mt-2 text-sm text-slate-400">
          Browse past lectures, combine quiz & flashcards, or generate more.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
          {error}
        </p>
      )}

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lectures..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{selected.size} selected</span>
            <button
              onClick={() => setShowCombine(true)}
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            >
              Combine
            </button>
            <button
              onClick={handleDeleteSelected}
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="accent-violet-500"
            />
            Select all ({filtered.length})
          </label>
        </div>
      )}

      {/* Lecture grid */}
      {filtered.length === 0 ? (
        <div className="glass-strong rounded-2xl p-12 text-center">
          {lectures.length === 0 ? (
            <>
              <p className="text-lg font-medium text-slate-300">No lectures yet</p>
              <p className="mt-2 text-sm text-slate-500">
                Upload a lecture on the Home page to get started.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No lectures match your search.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lec) => {
            const isSelected = selected.has(lec.id);
            const isEditing = editingId === lec.id;

            return (
              <div
                key={lec.id}
                className={`glass rounded-xl p-4 transition border ${
                  isSelected
                    ? "border-violet-500/40 bg-violet-500/[0.06]"
                    : "border-transparent hover:border-white/[0.08]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(lec.id)}
                    className="mt-1 accent-violet-500 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(lec.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                        />
                        <button
                          onClick={() => handleRename(lec.id)}
                          className="rounded-lg bg-violet-600 px-2 py-1 text-xs text-white hover:brightness-110"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-slate-500 hover:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(lec.id); setEditTitle(lec.title); }}
                        className="text-left text-sm font-medium text-white hover:text-violet-300 transition truncate block w-full"
                        title="Click to rename"
                      >
                        {lec.title}
                      </button>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{formatDate(lec.created_at)}</span>
                      <span className="h-3 w-px bg-white/10" />
                      <span className="text-violet-400/70">{lec.quiz_count} quiz</span>
                      <span className="text-emerald-400/70">{lec.flashcard_count} flashcards</span>
                      {lec.target_language && (
                        <>
                          <span className="h-3 w-px bg-white/10" />
                          <span className="capitalize">{lec.target_language}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {lec.quiz_count > 0 && (
                      <button
                        onClick={() => openSingleQuiz(lec)}
                        className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-violet-400 hover:bg-violet-500/[0.12] transition"
                        title="Start quiz"
                      >
                        Quiz
                      </button>
                    )}
                    {lec.flashcard_count > 0 && (
                      <button
                        onClick={() => openSingleFlashcards(lec)}
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/[0.12] transition"
                        title="Open flashcards"
                      >
                        Cards
                      </button>
                    )}
                    <button
                      onClick={() => setGenerateLecture(lec)}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/[0.12] transition"
                      title="Generate more quiz/flashcards"
                    >
                      +Gen
                    </button>
                    <button
                      onClick={() => handleDelete(lec.id)}
                      className="rounded-lg p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Combine modal */}
      {showCombine && (
        <CombineModal
          selected={selected}
          lectures={lectures}
          onClose={() => setShowCombine(false)}
          onCombine={handleCombine}
        />
      )}

      {/* Generate modal */}
      {generateLecture && (
        <GenerateModal
          lecture={generateLecture}
          onClose={() => setGenerateLecture(null)}
          onGenerated={load}
        />
      )}
    </div>
  );
}
