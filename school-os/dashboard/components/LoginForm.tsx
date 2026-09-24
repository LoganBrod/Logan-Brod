"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (res.ok) { router.replace(next); router.refresh(); return; }
    setErr((await res.json().catch(() => ({}))).error ?? "That is not it.");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password"
        className="w-full rounded-xl px-4 py-3 text-base outline-none"
        style={{ background: "var(--glass-2)", border: "1px solid var(--line)", color: "var(--text)" }}
      />
      {err ? <div className="text-sm" style={{ color: "var(--muted)" }}>{err}</div> : null}
      <button type="submit" disabled={busy || !pw} className="pressable rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-50" style={{ background: "var(--text)", color: "var(--bg)" }}>
        {busy ? "Checking…" : "Open"}
      </button>
    </form>
  );
}
