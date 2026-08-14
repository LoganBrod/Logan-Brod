"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface PublicCloset {
  code: string;
  name: string;
  by: string;
  publishedAt: string;
  itemCount: number;
  range: { min: number; max: number };
  preview: string[];
  likes: number;
  likedByYou: boolean;
}

interface Yours {
  code: string;
  name: string;
  itemCount: number;
}

interface State {
  configured: boolean;
  suggestedName: string;
  closets: PublicCloset[];
  yours: Yours[];
  mine: string[];
}

/**
 * Other people's closets.
 *
 * The feed is small and deliberately not ranked by likes. A like is a signal to
 * the person who built it, not an input to what everyone else is shown —
 * ordering by popularity would turn the page into the same six closets forever,
 * which is the opposite of what a discovery page is for.
 */
export default function Discover() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    fetch("/api/social")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: State | null) => {
        if (!json) return;
        setState(json);
        setName((current) => current || json.suggestedName);
      })
      .catch(() => setError("Couldn't load the feed."));
  }, []);

  useEffect(load, [load]);

  /**
   * Likes update on the spot and reconcile from the server afterwards. A like
   * that waits for a round trip feels broken, and the worst case here is a
   * count that corrects itself a moment later.
   */
  async function like(closet: PublicCloset) {
    const wanted = !closet.likedByYou;
    setState((current) =>
      current
        ? {
            ...current,
            closets: current.closets.map((item) =>
              item.code === closet.code
                ? { ...item, likedByYou: wanted, likes: Math.max(0, item.likes + (wanted ? 1 : -1)) }
                : item
            ),
          }
        : current
    );

    try {
      const res = await fetch("/api/social", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: closet.code, liked: wanted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("That like didn't save.");
      load();
    }
  }

  async function publish(code: string) {
    setPublishing(code);
    setError(null);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, by: name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't publish that closet.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish that closet.");
    } finally {
      setPublishing(null);
    }
  }

  async function withdraw(code: string) {
    await fetch(`/api/social?code=${code}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (!state) return null;

  if (!state.configured) {
    return (
      <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
        Sharing needs storage configured. Everything else works without it.
      </p>
    );
  }

  const unpublished = state.yours.filter((entry) => !state.mine.includes(entry.code));

  return (
    <div className="space-y-10">
      {error && (
        <p className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Publishing your own, kept above the feed because it's the thing a
          returning visitor came here to do. */}
      <section className="space-y-3">
        <h2 className="eyebrow">Share one of yours</h2>

        {state.yours.length === 0 ? (
          <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
            Keep a Clozet and you can publish it here. Only kept Clozets can be shared &mdash; an
            ordinary run expires after ninety days, and a feed of dead links helps nobody.
          </p>
        ) : (
          <div className="panel space-y-4 px-6 py-5">
            <label className="flex flex-wrap items-center gap-3 text-sm text-room-muted">
              Published as
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="A name, not your email"
                className="field w-56"
              />
            </label>

            <ul className="space-y-2">
              {unpublished.map((entry) => (
                <li key={entry.code} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-room-ink">
                    {entry.name}{" "}
                    <span className="text-xs text-room-faint">
                      {entry.itemCount} pieces · {entry.code}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => publish(entry.code)}
                    disabled={!name.trim() || publishing === entry.code}
                    className="btn-ghost"
                  >
                    {publishing === entry.code ? "Publishing…" : "Publish"}
                  </button>
                </li>
              ))}
              {state.mine.map((code) => (
                <li key={code} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-room-muted">
                    {state.yours.find((entry) => entry.code === code)?.name ?? code}{" "}
                    <span className="text-xs text-room-faint">published</span>
                  </span>
                  <button type="button" onClick={() => withdraw(code)} className="btn-ghost">
                    Take down
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Recently shared</h2>

        {state.closets.length === 0 ? (
          <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
            Nothing shared yet. Be first &mdash; a published closet is browsable by anyone with the
            link, and can be taken down at any time.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {state.closets.map((closet) => (
              <li key={closet.code} className="panel overflow-hidden">
                <Link href={`/closet/${closet.code}`} className="block">
                  <div className="grid grid-cols-4 gap-px bg-room-line">
                    {closet.preview.length > 0 ? (
                      closet.preview.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full bg-white object-cover"
                        />
                      ))
                    ) : (
                      <div className="col-span-4 aspect-[4/1] bg-room-sunk" />
                    )}
                  </div>
                </Link>

                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/closet/${closet.code}`}
                      className="font-semibold tracking-[-0.01em] text-lg text-room-ink hover:text-accent"
                    >
                      {closet.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-room-faint">
                      by {closet.by} · {closet.itemCount} pieces · ${closet.range.min}&ndash;$
                      {closet.range.max}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => like(closet)}
                    aria-pressed={closet.likedByYou}
                    aria-label={closet.likedByYou ? `Unlike ${closet.name}` : `Like ${closet.name}`}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      closet.likedByYou
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-room-line text-room-faint hover:text-room-ink"
                    }`}
                  >
                    <span aria-hidden>{closet.likedByYou ? "♥" : "♡"}</span>{" "}
                    {closet.likes > 0 ? closet.likes : ""}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
