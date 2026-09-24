"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Note } from "@/lib/vault";

export function NoteList({ notes, showCourse = false }: { notes: Note[]; showCourse?: boolean }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const types = useMemo(() => [...new Set(notes.map((n) => n.type).filter(Boolean))].sort(), [notes]);
  const shown = notes.filter((n) => {
    if (type && n.type !== type) return false;
    if (!q) return true;
    const hay = `${n.name} ${n.topics.join(" ")} ${n.excerpt} ${n.unit}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="card-2 flex items-center gap-2 px-3 py-2 flex-1 min-w-56">
          <MagnifyingGlass size={16} style={{ color: "var(--faint)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, topics, text" className="bg-transparent outline-none w-full text-sm placeholder:text-[var(--faint)]" />
        </label>
        <div className="flex gap-1 flex-wrap">
          {["", ...types].map((t) => (
            <button key={t || "all"} onClick={() => setType(t)} className={`pressable px-3 py-1.5 rounded-full text-xs ${type === t ? "accent-bg" : "card-2"}`}>{t || "all"}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>{notes.length ? "Nothing matches." : "No notes filed here yet. Scan a page or wait for the next sync."}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {shown.map((n) => (
            <li key={n.rel}>
              <Link href={`/note/${encodeURI(n.rel)}`} className="card pressable block p-4 h-full hover:bg-[var(--surface-2)]">
                <div className="flex items-center gap-2 mono text-[11px]" style={{ color: "var(--faint)" }}>
                  <span>{n.date || "undated"}</span>
                  {n.type && <span className="accent-tint accent-text px-1.5 rounded">{n.type}</span>}
                  {showCourse && <span>{n.course}</span>}
                  {n.unit && <span className="truncate">{n.unit}</span>}
                </div>
                <div className="mt-1.5 font-medium leading-snug">{n.name.replace(/^\d{4}-\d{2}-\d{2}\s*/, "")}</div>
                <p className="mt-1 text-sm line-clamp-2" style={{ color: "var(--muted)" }}>{n.excerpt}</p>
                {n.topics.length > 0 && <div className="mt-2 text-xs truncate" style={{ color: "var(--faint)" }}>{n.topics.slice(0, 5).join(" · ")}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
