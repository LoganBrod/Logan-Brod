"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface LiveEvent {
  at: string;
  type: "info" | "spike" | "clip" | "error";
  text: string;
  clipId?: string;
}

interface LiveSession {
  id: string;
  channel: string;
  status: "connecting" | "live" | "stopped" | "error";
  error?: string;
  videoId: string;
  startedAt: string;
  stoppedAt?: string;
  events: LiveEvent[];
}

const EVENT_ICON: Record<LiveEvent["type"], string> = {
  info: "·",
  spike: "🔊",
  clip: "🎬",
  error: "⚠",
};

export default function LivePage() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [channel, setChannel] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/live");
    if (res.ok) setSessions(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const anyActive = sessions.some(
    (s) => s.status === "live" || s.status === "connecting"
  );
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't start");
      setChannel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start");
    } finally {
      setStarting(false);
    }
  }

  async function stopOrRemove(id: string) {
    await fetch(`/api/live/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h1 className="text-xl font-extrabold text-fog">
          Live clipper <span className="text-brand">· Kick</span>
        </h1>
        <p className="mt-1 text-sm text-fog/60">
          Watches the stream in real time, learns its normal loudness, and
          auto-clips the moments that spike above it — captions, hooks, and
          outro included. Clips land in the queue below as they happen.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && channel.trim() && start()}
            placeholder="Kick channel name (or paste an .m3u8 stream URL)"
            className="w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none"
          />
          <button
            onClick={start}
            disabled={starting || !channel.trim()}
            className="shrink-0 rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
          >
            {starting ? "Connecting…" : "Start watching"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <p className="mt-3 text-xs text-fog/40">
          Auto-posting follows the setting on the dashboard — off means clips
          wait for your approval. Recordings stop automatically after 12h.
        </p>
      </section>

      {sessions.length === 0 ? (
        <p className="text-sm text-fog/40">No live sessions yet.</p>
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => (
            <section
              key={s.id}
              className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {(s.status === "live" || s.status === "connecting") && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                  )}
                  <span className="font-bold text-fog">{s.channel}</span>
                  <span
                    className={
                      s.status === "live"
                        ? "text-sm text-brand"
                        : s.status === "error"
                          ? "text-sm text-red-400"
                          : "text-sm text-fog/50"
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/video/${s.videoId}`}
                    className="rounded-lg bg-brand px-4 py-1.5 font-bold text-ink transition hover:bg-brand-dim"
                  >
                    Open clips
                  </Link>
                  <button
                    onClick={() => stopOrRemove(s.id)}
                    className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-red-500/80 hover:text-white"
                  >
                    {s.status === "live" || s.status === "connecting"
                      ? "Stop"
                      : "Remove"}
                  </button>
                </div>
              </div>
              {s.error && <p className="mt-2 text-sm text-red-400">{s.error}</p>}
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {[...s.events].reverse().map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 shrink-0 text-center">{EVENT_ICON[e.type]}</span>
                    <span className="shrink-0 font-mono text-xs text-fog/40">
                      {new Date(e.at).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        e.type === "clip"
                          ? "text-brand"
                          : e.type === "error"
                            ? "text-red-400"
                            : "text-fog/70"
                      }
                    >
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
