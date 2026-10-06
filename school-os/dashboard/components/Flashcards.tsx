"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowsClockwise } from "@phosphor-icons/react";

export function Flashcards({ cards }: { cards: { q: string; a: string }[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards.length) return <p style={{ color: "var(--muted)" }}>This deck has no cards yet.</p>;
  const card = cards[i];
  const go = (d: number) => { setFlipped(false); setI((i + d + cards.length) % cards.length); };
  return (
    <div className="grid gap-4">
      <button onClick={() => setFlipped(!flipped)} className="card pressable text-left p-6 md:p-8 min-h-56 grid content-center gap-3" aria-label={flipped ? "Show question" : "Show answer"}>
        <div className="mono text-xs" style={{ color: "var(--faint)" }}>{flipped ? "Answer" : "Question"} · {i + 1} / {cards.length}</div>
        <div className="text-lg md:text-xl leading-relaxed whitespace-pre-wrap">{flipped ? card.a : card.q}</div>
        {!flipped && <div className="text-sm" style={{ color: "var(--muted)" }}>Tap to reveal</div>}
      </button>
      <div className="flex items-center justify-between">
        <button onClick={() => go(-1)} className="pressable card-2 px-4 py-2 flex items-center gap-2 text-sm"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => setFlipped(!flipped)} className="pressable accent-bg px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium"><ArrowsClockwise size={16} /> Flip</button>
        <button onClick={() => go(1)} className="pressable card-2 px-4 py-2 flex items-center gap-2 text-sm">Next <ArrowRight size={16} /></button>
      </div>
    </div>
  );
}
