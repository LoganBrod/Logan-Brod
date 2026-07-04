"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Highlight {
  time: number;
  score: number;
  suggestedStart: number;
  suggestedEnd: number;
}

interface Clip {
  id: string;
  start: number;
  end: number;
  status: string;
  error?: string;
  file?: string;
  transcript?: string;
  hooks?: string[];
  caption?: string;
  notes?: string;
}

interface VideoDetail {
  id: string;
  filename: string;
  file: string;
  duration: number;
  highlights?: Highlight[];
  clips: Clip[];
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  cutting: "Cutting + reframing…",
  transcribing: "Transcribing audio…",
  captioning: "Burning captions…",
  end_card: "Adding end card…",
  writing_hooks: "Writing hooks…",
  ready: "Ready",
  error: "Failed",
};

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

export default function Workbench({ id }: { id: string }) {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(20);
  const [cropMode, setCropMode] = useState<"crop" | "blur">("crop");
  const [captions, setCaptions] = useState(true);
  const [endCard, setEndCard] = useState(true);
  const [notes, setNotes] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setEndCard(Boolean(s.enabled)))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/videos/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) setVideo(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any clip is processing
  const processing = video?.clips.some(
    (c) => c.status !== "ready" && c.status !== "error"
  );
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [processing, load]);

  if (notFound) {
    return (
      <p className="text-neutral-400">
        Video not found. <Link href="/" className="text-brand">Back to dashboard</Link>
      </p>
    );
  }
  if (!video) return <p className="text-neutral-500">Loading…</p>;

  async function detect() {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${id}/highlights`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Detection failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function createClip() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${id}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, cropMode, captions, endCard, notes }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create clip");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clip");
    } finally {
      setCreating(false);
    }
  }

  async function deleteClip(clipId: string) {
    await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
    await load();
  }

  async function regenerate(clipId: string) {
    await fetch(`/api/clips/${clipId}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await load();
  }

  function seekTo(t: number) {
    if (playerRef.current) {
      playerRef.current.currentTime = t;
      playerRef.current.play().catch(() => {});
    }
  }

  function useHighlight(h: Highlight) {
    setStart(Math.round(h.suggestedStart * 10) / 10);
    setEnd(Math.round(h.suggestedEnd * 10) / 10);
    seekTo(h.suggestedStart);
  }

  const currentTime = () => playerRef.current?.currentTime ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-brand">
          ← All footage
        </Link>
        <h1 className="mt-1 truncate text-xl font-bold">{video.filename}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Player + highlights */}
        <section className="space-y-4">
          <video
            ref={playerRef}
            src={`/api/media/${video.file}`}
            controls
            className="w-full rounded-xl border border-ink-border bg-black"
          />
          <div className="rounded-xl border border-ink-border bg-ink-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Highlight moments</h2>
              <button
                onClick={detect}
                disabled={detecting}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                {detecting ? "Scanning audio…" : "Detect highlights"}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Finds the loudest moments (wins, reactions) in the audio track.
            </p>
            {video.highlights && video.highlights.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {video.highlights.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      onClick={() => seekTo(h.time)}
                      className="text-brand hover:underline"
                    >
                      {fmt(h.time)}
                    </button>
                    <div className="mx-2 h-1.5 flex-1 overflow-hidden rounded bg-ink-border">
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${Math.round(h.score * 100)}%` }}
                      />
                    </div>
                    <button
                      onClick={() => useHighlight(h)}
                      className="rounded bg-ink-border px-2 py-1 text-xs font-semibold hover:bg-brand/60"
                    >
                      Use
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Clip builder */}
        <section className="rounded-xl border border-ink-border bg-ink-card p-4">
          <h2 className="font-bold">Cut a clip</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-neutral-400">Start (s)</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
                />
                <button
                  onClick={() => setStart(Math.round(currentTime() * 10) / 10)}
                  title="Use player position"
                  className="rounded-lg bg-ink-border px-2 text-xs"
                >
                  now
                </button>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-neutral-400">End (s)</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
                />
                <button
                  onClick={() => setEnd(Math.round(currentTime() * 10) / 10)}
                  title="Use player position"
                  className="rounded-lg bg-ink-border px-2 text-xs"
                >
                  now
                </button>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-neutral-400">Framing</span>
              <select
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as "crop" | "blur")}
                className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
              >
                <option value="crop">Center crop to 9:16</option>
                <option value="blur">Full frame + blurred background</option>
              </select>
            </label>
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={captions}
                  onChange={(e) => setCaptions(e.target.checked)}
                  className="h-4 w-4 accent-[#8b5cf6]"
                />
                <span>Burn captions (Whisper)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={endCard}
                  onChange={(e) => setEndCard(e.target.checked)}
                  className="h-4 w-4 accent-[#8b5cf6]"
                />
                <span>Promo end card</span>
              </label>
            </div>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-neutral-400">
              Notes for the hook writer (game, bet size, outcome…)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. $2 spin on Gates of Olympus, hit a 5000x max win"
              className="mt-1 w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
            />
          </label>
          <button
            onClick={createClip}
            disabled={creating}
            className="mt-4 w-full rounded-lg bg-brand py-2 font-semibold disabled:opacity-50"
          >
            {creating ? "Queuing…" : `Create clip (${fmt(start)} → ${fmt(end)})`}
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </section>
      </div>

      {/* Clips */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Clips</h2>
        {video.clips.length === 0 ? (
          <p className="text-sm text-neutral-500">No clips yet — cut one above.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {video.clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onDelete={() => deleteClip(clip.id)}
                onRegenerate={() => regenerate(clip.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClipCard({
  clip,
  onDelete,
  onRegenerate,
}: {
  clip: Clip;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const busy = clip.status !== "ready" && clip.status !== "error";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-ink-border bg-ink-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {fmt(clip.start)} → {fmt(clip.end)}
        </span>
        <span
          className={
            clip.status === "ready"
              ? "text-green-400"
              : clip.status === "error"
                ? "text-red-400"
                : "animate-pulse text-brand"
          }
        >
          {STATUS_LABEL[clip.status] ?? clip.status}
        </span>
      </div>
      {clip.error && <p className="mt-1 text-xs text-red-400">{clip.error}</p>}

      {clip.file && !busy && (
        <video
          src={`/api/media/${clip.file}`}
          controls
          className="mt-3 max-h-96 w-full rounded-lg border border-ink-border bg-black"
        />
      )}

      {clip.hooks && clip.hooks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            Hook options
          </h3>
          <ul className="mt-1 space-y-1">
            {clip.hooks.map((hook, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>{hook}</span>
                <button
                  onClick={() => copy(hook, `hook-${i}`)}
                  className="shrink-0 rounded bg-ink-border px-2 py-0.5 text-xs hover:bg-brand/60"
                >
                  {copied === `hook-${i}` ? "Copied!" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {clip.caption && (
        <div className="mt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            X caption
          </h3>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-ink p-2 text-sm">
            {clip.caption}
          </p>
          <button
            onClick={() => copy(clip.caption!, "caption")}
            className="mt-1 rounded bg-ink-border px-2 py-0.5 text-xs hover:bg-brand/60"
          >
            {copied === "caption" ? "Copied!" : "Copy caption"}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-sm">
        {clip.file && !busy && (
          <a
            href={`/api/media/${clip.file}`}
            download={`clip-${clip.id}.mp4`}
            className="rounded-lg bg-brand px-3 py-1.5 font-semibold"
          >
            Download
          </a>
        )}
        {clip.status === "ready" && (
          <button
            onClick={onRegenerate}
            className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold hover:bg-brand/60"
          >
            Regenerate hooks
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto rounded-lg px-2 py-1.5 text-neutral-500 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
