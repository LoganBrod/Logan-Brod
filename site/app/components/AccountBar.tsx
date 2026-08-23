"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface AuthState {
  available: boolean;
  /** Whether a sign-in link can actually be sent. Passwords work without it. */
  links: boolean;
  minPasswordLength: number;
  user: { email: string } | null;
}

type Mode = "closed" | "signin" | "create" | "password";

/**
 * Sign in, or say who's signed in.
 *
 * Two ways in, on purpose. A password is the fast one for someone who comes
 * back often; a link is how you get in when you've forgotten it, and how an
 * account that has never had a password works at all. The link is only offered
 * when there's a provider configured to send it.
 *
 * Renders nothing until it knows accounts are possible — the app works
 * anonymously, so this is an addition to the page rather than a gate.
 */
export default function AccountBar() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [mode, setMode] = useState<Mode>("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: AuthState | null) => json && setAuth(json))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function post(body: unknown, method = "POST") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "That didn't work.");
      return json ?? {};
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // Setting a password on an account you're already in.
    if (mode === "password") {
      if (await post({ password }, "PUT")) {
        setMode("closed");
        setPassword("");
        setNotice("Password set. You can use it to sign in from now on.");
      }
      return;
    }

    const result = await post({ email, password, create: mode === "create" });
    if (!result) return;

    // A full reload: closets and taste are read server-side under the identity
    // that just changed, so re-rendering in place would show the old one.
    window.location.reload();
  }

  async function emailLink() {
    const result = await post({ email });
    if (!result) return;
    setMode("closed");
    setNotice(
      result.delivery === "logged"
        ? "Email isn't configured here, so the link went to the server console."
        : `Check ${email} - the link works once and expires in 15 minutes.`
    );
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    window.location.href = "/";
  }

  if (!auth?.available) return null;

  if (auth.user) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-room-faint">
          <Link href="/closets" className="-my-2 py-2 font-semibold text-room-muted hover:text-room-ink sm:my-0 sm:py-0">
            Your clozets
          </Link>
          <span aria-hidden>&middot;</span>
          <span className="truncate">{auth.user.email}</span>
          <button
            type="button"
            onClick={() => setMode(mode === "password" ? "closed" : "password")}
            className="hover:text-room-ink"
          >
            {mode === "password" ? "Cancel" : "Set password"}
          </button>
          <button type="button" onClick={signOut} className="hover:text-room-ink">
            Sign out
          </button>
        </div>

        {mode === "password" && (
          <form onSubmit={submit} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="password"
              required
              autoFocus
              minLength={auth.minPasswordLength}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${auth.minPasswordLength} characters`}
              aria-label="New password"
              autoComplete="new-password"
              className="field w-full sm:w-56"
            />
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        )}

        {notice && <p className="text-xs text-room-muted">{notice}</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  if (mode === "closed") {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/closets"
            className="-my-2 py-2 text-xs font-semibold text-room-muted hover:text-room-ink sm:my-0 sm:py-0"
          >
            Your clozets
          </Link>
          <button type="button" onClick={() => setMode("signin")} className="btn-ghost">
            Sign in
          </button>
        </div>
        {notice && <p className="max-w-sm text-xs leading-relaxed text-room-muted">{notice}</p>}
      </div>
    );
  }

  const creating = mode === "create";

  return (
    <div className="flex flex-col items-end gap-2">
      <form onSubmit={submit} className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          autoComplete="email"
          className="field w-full sm:w-52"
        />
        <input
          type="password"
          required
          minLength={auth.minPasswordLength}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete={creating ? "new-password" : "current-password"}
          className="field w-full sm:w-44"
        />
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "…" : creating ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-room-faint">
        <button
          type="button"
          onClick={() => setMode(creating ? "signin" : "create")}
          className="hover:text-room-ink"
        >
          {creating ? "I already have an account" : "Create an account"}
        </button>
        {/* Only offered when a link can actually be sent - and it doubles as the
            way back in for someone who's forgotten their password. */}
        {auth.links && (
          <button
            type="button"
            onClick={emailLink}
            disabled={busy || !email}
            className="hover:text-room-ink disabled:opacity-40"
          >
            Email me a link instead
          </button>
        )}
        <button type="button" onClick={() => setMode("closed")} className="hover:text-room-ink">
          Cancel
        </button>
      </div>

      {error && <p className="max-w-sm text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
