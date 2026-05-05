import { useState } from "react";

export default function FlipCard({ front, back, onFlip }) {
  const [flipped, setFlipped] = useState(false);

  const toggle = () => {
    setFlipped((f) => !f);
    onFlip?.(!flipped);
  };

  return (
    <div className="flip-scene mx-auto max-w-lg cursor-pointer" onClick={toggle} title="Click to flip">
      <div className={`flip-inner glass rounded-2xl shadow-lg shadow-black/20 ${flipped ? "is-flipped" : ""}`}>
        <div className="flip-face absolute inset-0 flex flex-col rounded-2xl p-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60">Front</p>
          <p className="mt-4 flex-1 whitespace-pre-wrap text-base leading-relaxed text-white">{front}</p>
          <p className="mt-4 text-center text-xs text-slate-500">Tap or Space to flip</p>
        </div>
        <div className="flip-face flip-back absolute inset-0 flex flex-col rounded-2xl p-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/60">Back</p>
          <p className="mt-4 flex-1 whitespace-pre-wrap text-base leading-relaxed text-slate-200">{back}</p>
        </div>
      </div>
    </div>
  );
}

FlipCard.reset = Symbol("reset");
