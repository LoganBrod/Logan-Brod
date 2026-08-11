"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface AuthState {
  available: boolean;
  user: { email: string } | null;
}

/**
 * Sign in, or say who's signed in.
 *
 * Renders nothing at all until it knows whether accounts are even possible —
 * offering a sign-in box that can only fail is worse than offering none. The
 * app works anonymously either way, so this is an addition to the page rather
 * than a gate in front of it.
 */
export default function AccountBar() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: AuthState | null) => json && setAuth(json))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't send that link.");

      setSent(
        json?.delivery === "logged"
          ? "Email isn't configured here, so the link went to the server console."
          : `Check ${email} — the link works once and expires in 15 minutes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that link.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    setAuth((current) => (current ? { ...current, user: null } : current));
    // A full reload, because closets and taste are all read server-side under
    // the identity that just changed.
    window.location.href = "/";
  }

  if (!auth?.available) return null;

  if (auth.user) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs text-room-faint">
        <Link href="/closets" className="font-semibold text-room-muted hover:text-room-ink">
          Your closets
        </Link>
        <span aria-hidden>&middot;</span>
        <span className="truncate">{auth.user.email}</span>
        <button type="button" onClick={signOut} className="hover:text-room-ink">
          Sign out
        </button>
      </div>
    );
  }

  if (sent) {
    return <p className="max-w-sm text-xs leading-relaxed text-room-muted">{sent}</p>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link href="/closets" className="text-xs font-semibold text-room-muted hover:text-room-ink">
        Your closets
      </Link>

      {open ? (
        <form onSubmit={requestLink} className="flex items-center gap-2">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="field w-52"
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
          Sign in
        </button>
      )}

      {error && <p className="w-full text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
