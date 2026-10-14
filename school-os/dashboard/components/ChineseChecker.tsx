"use client";
import { useState } from "react";
import { readJson } from "@/lib/client";
import type { CheckResult, Token } from "@/lib/chinese";

type Change = { original: string; corrected: string; why: string };
type Fix = { corrected: string; changes: Change[]; note: string; verified: boolean; violations: { words: string[]; structures: string[] }; attempts: number; result: CheckResult };

const STYLE: Record<Token["status"], React.CSSProperties> = {
  known: {},
  other: {},
  new: { textDecoration: "underline dotted", textDecorationColor: "#f59e0b", textDecorationThickness: 2, textUnderlineOffset: 4 },
  unknown: { textDecoration: "underline wavy", textDecorationColor: "#ef4444", textDecorationThickness: 1.5, textUnderlineOffset: 4 },
};

export function ChineseChecker({ ready, learned, canFix }: { ready: boolean; learned: string[]; canFix: boolean }) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "fix">("");
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState<Set<string>>(new Set());

  async function run(op: "check" | "fix") {
    setBusy(op); setError(""); if (op === "check") setFix(null);
    try {
      const data = await readJson<{ result?: CheckResult; error?: string } & Partial<Fix>>(await fetch("/api/chinese", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, text }) }));
      if (data.error) throw new Error(data.error);
      if (op === "check") setChecked(data.result ?? null);
      else { setFix(data as Fix); setChecked(null); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  async function allow(word: string) {
    await fetch("/api/chinese", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "allow", word }) });
    setAllowed((a) => new Set([...a, word]));
  }

  const btn = "pressable rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40";
  return (
    <>
      <textarea value={text} onChange={(e) => { setText(e.target.value); }} lang="zh" placeholder="粘贴或输入你的中文…" spellCheck={false}
        className="w-full rounded-2xl p-4 text-lg leading-relaxed outline-none" style={{ minHeight: 180, background: "var(--glass-2)", border: "1px solid var(--line)", color: "var(--text)" }} />
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => run("check")} disabled={!ready || !text.trim() || !!busy} className={btn} style={{ background: "var(--text)", color: "var(--bg)" }}>{busy === "check" ? "Checking…" : "Check (free)"}</button>
        <button onClick={() => run("fix")} disabled={!ready || !canFix || !text.trim() || !!busy} className={btn} style={{ background: "var(--glass-2)", color: "var(--text)" }} title={canFix ? "" : "Needs a Claude key"}>{busy === "fix" ? "Fixing and verifying…" : "Fix grammar with only what I've learned"}</button>
        <span className="text-xs" style={{ color: "var(--faint)" }}><span style={STYLE.new}>dotted</span> new word from known characters · <span style={STYLE.unknown}>wavy</span> not in your material</span>
      </div>
      {error && <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>}

      {checked && <Report result={checked} allowed={allowed} onAllow={allow} />}

      {fix && (
        <section className="grid gap-4">
          <div className="card p-4 text-sm" style={{ borderColor: fix.verified ? "rgb(34 197 94 / 0.5)" : "rgb(239 68 68 / 0.5)" }}>
            {fix.verified
              ? <>Verified: every word and structure in the correction is from your material{fix.attempts > 1 ? ` (took ${fix.attempts} tries; earlier ones used words you haven't learned and were sent back)` : ""}.</>
              : <>Not verified after {fix.attempts} tries. Still outside your material: {[...fix.violations.words, ...fix.violations.structures].join("、")}. Those spots are marked below; treat them with suspicion.</>}
          </div>
          <Report result={fix.result} allowed={allowed} onAllow={allow} title="Corrected" />
          {fix.changes.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-medium mb-2">Changes</h2>
              <ul className="grid gap-2">
                {fix.changes.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span lang="zh" style={{ textDecoration: "line-through", color: "var(--muted)" }}>{c.original}</span> → <span lang="zh" className="font-medium">{c.corrected}</span>
                    <div style={{ color: "var(--muted)" }}>{c.why}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fix.changes.length === 0 && fix.verified && <p className="text-sm" style={{ color: "var(--muted)" }}>No errors found.</p>}
          {fix.note && <p className="text-sm" style={{ color: "var(--muted)" }}>{fix.note}</p>}
        </section>
      )}

      {!checked && !fix && learned.length > 0 && (
        <details className="text-sm" style={{ color: "var(--muted)" }}>
          <summary className="cursor-pointer">Structures the checker counts as learned ({learned.length})</summary>
          <p className="mt-2" lang="zh">{learned.join(" · ")}</p>
          <p className="mt-1">Change this in 04 System/Chinese list.md.</p>
        </details>
      )}
    </>
  );
}

function Report({ result, allowed, onAllow, title }: { result: CheckResult; allowed: Set<string>; onAllow: (w: string) => void; title?: string }) {
  const flagged = result.flagged.filter((f) => !allowed.has(f.word));
  return (
    <section className="grid gap-3">
      <div className="card p-4">
        {title && <div className="text-xs mb-2" style={{ color: "var(--faint)" }}>{title}</div>}
        <p lang="zh" className="text-lg leading-loose whitespace-pre-wrap">
          {result.tokens.map((t, i) => (
            <span key={i} style={allowed.has(t.text) ? {} : STYLE[t.status]} title={t.status === "unknown" ? `Not in your material${t.unknownChars ? `: ${t.unknownChars}` : ""}` : t.status === "new" ? "New word, but you know every character" : t.learnedIn ? `From ${t.learnedIn}` : undefined}>{t.text}</span>
          ))}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {result.structures.map((s) => (
          <span key={s.id} lang="zh" className="text-xs rounded-full px-2.5 py-1" title={s.learned ? `Learned${s.learnedIn ? ` · ${s.learnedIn}` : ""}` : "Not in your material"}
            style={{ background: s.learned ? "rgb(34 197 94 / 0.14)" : "rgb(239 68 68 / 0.16)", border: `1px solid ${s.learned ? "rgb(34 197 94 / 0.35)" : "rgb(239 68 68 / 0.4)"}` }}>
            {s.learned ? "✓" : "✗"} {s.name}
          </span>
        ))}
        {!result.structures.length && <span className="text-xs" style={{ color: "var(--faint)" }}>No tracked structures in this text.</span>}
      </div>
      {flagged.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-medium mb-2">Not in your material ({flagged.length})</h2>
          <ul className="grid gap-1.5">
            {flagged.map((f) => (
              <li key={f.word} className="flex items-center gap-3 text-sm">
                <span lang="zh" className="text-base" style={STYLE[f.status]}>{f.word}</span>
                <span style={{ color: "var(--muted)" }}>{f.status === "unknown" ? `unknown character${(f.unknownChars?.length ?? 0) > 1 ? "s" : ""} ${f.unknownChars}` : "you know the characters, not this word"}</span>
                <span className="grow" />
                <button onClick={() => onAllow(f.word)} className="pressable text-xs rounded-lg px-2.5 py-1" style={{ background: "var(--glass-2)" }}>I've learned this</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
