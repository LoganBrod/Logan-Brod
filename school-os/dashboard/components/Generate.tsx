"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cards, Exam, ListChecks } from "@phosphor-icons/react";

const KINDS = [
  { kind: "flashcards", label: "Flashcards", Icon: Cards },
  { kind: "test", label: "Practice test", Icon: Exam },
  { kind: "review", label: "Unit review", Icon: ListChecks },
] as const;

export function Generate({ course, units }: { course: string; units: string[] }) {
  const router = useRouter();
  const [unit, setUnit] = useState(units[0] ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function ask(kind: string) {
    setState("busy");
    const res = await fetch("/api/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course, unit, kind }) });
    setState(res.ok ? "done" : "error");
    router.refresh();
  }
  return (
    <div className="card p-4 grid gap-3">
      <div className="text-sm font-medium">Make new material</div>
      <select value={unit} onChange={(e) => setUnit(e.target.value)} className="card-2 px-3 py-2 text-sm outline-none">
        <option value="">Whole course</option>
        {units.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map(({ kind, label, Icon }) => (
          <button key={kind} disabled={state === "busy"} onClick={() => ask(kind)} className="pressable card-2 px-2 py-3 text-xs flex flex-col items-center gap-1.5 hover:bg-[var(--border)] disabled:opacity-50">
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {state === "done" ? "Requested. It appears here after the next sync (up to 30 min), or run npm run sync now." :
         state === "error" ? "Could not write the request. Is the vault path right?" :
         "Adds a tag the brain acts on at the next sync."}
      </p>
    </div>
  );
}
