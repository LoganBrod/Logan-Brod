"use client";

import { useCallback, useEffect, useState } from "react";

interface Watch {
  id: string;
  name: string;
  queries: string[];
  range: { min: number; max: number };
  createdAt: string;
  lastSweptAt?: string;
  found: number;
  paused?: boolean;
}

interface State {
  configured: boolean;
  plan: "free" | "member";
  limit: number;
  canEmail: boolean;
  watches: Watch[];
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "not yet";

/**
 * Standing searches.
 *
 * The list is deliberately honest about what each one has actually produced —
 * `found` is the number of pieces it has ever surfaced, which is the only real
 * measure of whether a watch earns its place. A watch that has run for a month
 * and found nothing should be visibly a watch that has found nothing.
 */
export default function Watches() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/watches")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: State | null) => json && setState(json))
      .catch(() => setError("Couldn't load your watches."));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    }
  }

  if (!state?.configured) return null;

  if (!state.watches.length) {
    return (
      <section className="space-y-3">
        <h2 className="label">Standing searches</h2>
        <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
          {state.limit > 0 ? (
            <>
              Nothing on watch. Secondhand stock moves fast &mdash; the right piece is listed on a
              Tuesday and gone by Wednesday. Finish a closet and you can leave its searches running.
            </>
          ) : (
            <>
              Standing searches keep looking after you close the tab, and email you when something
              turns up that clears your bar. They&rsquo;re part of membership.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label">Standing searches</h2>
        <p className="text-xs text-room-faint">
          {state.canEmail
            ? "Checked twice a day. You'll get an email when something clears the bar."
            : "Checked twice a day. Sign in to be emailed when something turns up."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {state.watches.map((watch) => (
          <li key={watch.id} className="panel flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg text-room-ink">{watch.name}</p>
              <p className="mt-0.5 text-xs text-room-faint">
                {watch.queries.slice(0, 3).join(" · ")}
                {watch.queries.length > 3 ? ` +${watch.queries.length - 3}` : ""}
              </p>
              <p className="mt-1 text-xs text-room-faint">
                ${watch.range.min}&ndash;${watch.range.max} · last checked {when(watch.lastSweptAt)} ·{" "}
                {watch.found === 0
                  ? "nothing found yet"
                  : `${watch.found} ${watch.found === 1 ? "piece" : "pieces"} found`}
                {watch.paused ? " · paused" : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => send("PATCH", "/api/watches", { id: watch.id, paused: !watch.paused })}
                className="btn-ghost"
              >
                {watch.paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={() => send("DELETE", `/api/watches?id=${watch.id}`)}
                aria-label={`Stop watching ${watch.name}`}
                className="rounded-full px-2 py-1 text-xs text-room-faint transition-colors hover:bg-room-sunk hover:text-room-ink"
              >
                Stop
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
