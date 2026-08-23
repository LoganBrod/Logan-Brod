"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Entry {
  code: string;
  name?: string;
  createdAt: string;
  keptAt?: string;
  itemCount: number;
  range: { min: number; max: number };
}

interface Library {
  configured: boolean;
  signedIn: boolean;
  email?: string | null;
  closets: Entry[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Every closet you've built.
 *
 * Kept ones first, then the rest as history. The distinction is the whole point
 * of the page: a kept closet was chosen and lives until you say otherwise, a
 * run was merely made and expires in ninety days.
 */
export default function ClosetLibrary() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    fetch("/api/closets")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: Library | null) => json && setLibrary(json))
      .catch(() => setError("Couldn't load your clozets."));
  }, []);

  useEffect(load, [load]);

  async function send(method: string, url: string, body?: unknown) {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "That didn't work.");
      load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      return false;
    }
  }

  async function keep(event: React.FormEvent, code: string) {
    event.preventDefault();
    if (!name.trim()) return;
    if (await send("PATCH", "/api/closets", { code, name, keep: true })) {
      setNaming(null);
      setName("");
    }
  }

  if (!library) {
    return <p className="text-sm text-room-muted">Loading&hellip;</p>;
  }

  if (!library.configured) {
    return (
      <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
        Saving isn&rsquo;t set up, so there&rsquo;s nothing to list. Add Upstash Redis
        (Vercel &rarr; Storage &rarr; Marketplace) and clozets will start appearing here.
      </p>
    );
  }

  if (!library.closets.length) {
    return (
      <div className="panel px-6 py-8 text-center">
        <p className="mb-4 text-sm text-room-muted">
          Nothing here yet. Every clozet you build shows up on this page automatically.
        </p>
        <Link href="/closet" className="btn-primary inline-block">
          Build one
        </Link>
      </div>
    );
  }

  const kept = library.closets.filter((entry) => entry.keptAt);
  const history = library.closets.filter((entry) => !entry.keptAt);

  const row = (entry: Entry) => (
    <li key={entry.code} className="panel flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/closet/${entry.code}`}
          className="font-semibold tracking-[-0.01em] text-lg text-room-ink underline-offset-4 hover:underline"
        >
          {entry.name ?? entry.code}
        </Link>
        <p className="mt-0.5 text-xs text-room-faint">
          <span className="font-mono tracking-[0.15em]">{entry.code}</span>
          {" · "}
          {entry.itemCount} {entry.itemCount === 1 ? "piece" : "pieces"}
          {" · "}${entry.range.min}&ndash;${entry.range.max}
          {" · "}
          {when(entry.createdAt)}
        </p>
      </div>

      {naming === entry.code ? (
        <form onSubmit={(e) => keep(e, entry.code)} className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Call it something"
            aria-label="Name for this clozet"
            className="field w-48"
          />
          <button type="submit" className="btn-primary">
            Keep
          </button>
          <button type="button" onClick={() => setNaming(null)} className="btn-ghost">
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          {entry.keptAt ? (
            <button
              type="button"
              onClick={() => send("PATCH", "/api/closets", { code: entry.code, keep: false })}
              className="btn-ghost"
            >
              Stop keeping
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNaming(entry.code);
                setName("");
              }}
              className="btn-primary"
            >
              Keep
            </button>
          )}
          <button
            type="button"
            onClick={() => send("DELETE", `/api/closets?code=${entry.code}`)}
            aria-label={`Remove ${entry.name ?? entry.code} from this list`}
            className="rounded-full px-2 py-1 text-xs text-room-faint transition-colors hover:bg-room-sunk hover:text-room-ink"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {kept.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">Kept</h2>
          <ul className="space-y-3">{kept.map(row)}</ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow">Everything else</h2>
            <p className="text-xs text-room-faint">
              These expire 90 days after they were built. Keep one to make it permanent.
            </p>
          </div>
          <ul className="space-y-3">{history.map(row)}</ul>
        </section>
      )}

      {!library.signedIn && (
        <p className="text-xs leading-relaxed text-room-faint">
          These are saved to this browser. Sign in and they&rsquo;ll follow you to any device
          - along with your sizes and everything the app has learned about what you like.
        </p>
      )}
    </div>
  );
}
