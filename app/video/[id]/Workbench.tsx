"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Highlight {
  time: number;
  score: number;
  suggestedStart: number;
  suggestedEnd: number;
  source: "audio" | "ai" | "youtube";
  label?: string;
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
  posted?: { platform: string; id: string; url: string; at: string };
  metrics?: { views: number; likes: number; reposts: number; updatedAt: string };
  brainScore?: { score: number; reason: string; at: string };
  experimentId?: string;
  autoPost?: boolean;
}

interface Experiment {
  id: string;
  hypothesis: string;
  instruction: string;
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
  end_card: "Adding outro…",
  writing_hooks: "Writing hooks…",
  posting: "Posting to X…",
  ready: "Ready",
  error: "Failed",
};

const SOURCE_BADGE: Record<Highlight["source"], { icon: string; name: string }> = {
  audio: { icon: "🔊", name: "Loudest" },
  ai: { icon: "✨", name: "AI" },
  youtube: { icon: "▶", name: "Replayed" },
};

function fmt(t: number) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export default function Workbench({ id }: { id: string }) {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState("");

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(20);
  const [cropMode, setCropMode] = useState<"crop" | "blur">("crop");
  const [captions, setCaptions] = useState(true);
  const [endCard, setEndCard] = useState(true);
  const [canPost, setCanPost] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [notes, setNotes] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);

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
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setEndCard(Boolean(s.enabled));
        setCanPost(Boolean(s.canPost));
        setMinScore(Number(s.minScore) || 0);
      })
      .catch(() => {});
    fetch("/api/evolve")
      .then((r) => r.json())
      .then((p) => setExperiments(p?.experiments ?? []))
      .catch(() => {});
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
      <p className="text-fog/60">
        Video not found.{" "}
        <Link href="/" className="text-brand">
          Back to dashboard
        </Link>
      </p>
    );
  }
  if (!video) return <p className="text-fog/40">Loading…</p>;

  async function findMoments(source: "audio" | "ai" | "youtube") {
    setBusySource(source);
    setError(null);
    try {
      const url =
        source === "audio"
          ? `/api/videos/${id}/highlights`
          : source === "ai"
            ? `/api/videos/${id}/aiscan`
            : `/api/videos/${id}/youtube`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: source === "youtube" ? JSON.stringify({ url: ytUrl }) : undefined,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Scan failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusySource(null);
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

  const field =
    "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none";
  const smallBtn =
    "rounded-lg bg-ink-border px-2 py-1 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-fog/50 hover:text-brand">
          ← All footage
        </Link>
        <h1 className="mt-1 truncate text-xl font-extrabold text-fog">
          {video.filename}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Player + moment finding */}
        <section className="space-y-4">
          <video
            ref={playerRef}
            src={`/api/media/${video.file}`}
            controls
            className="w-full rounded-2xl border border-ink-border bg-black shadow-card"
          />
          <div className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Find moments
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => findMoments("audio")}
                disabled={busySource !== null}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                {busySource === "audio" ? "Scanning…" : "🔊 Loudest moments"}
              </button>
              <button
                onClick={() => findMoments("ai")}
                disabled={busySource !== null}
                title="Transcribes the whole video and asks AI for the funniest / most hype moments"
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                {busySource === "ai" ? "Scanning… (can take a few min)" : "✨ AI scan"}
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="YouTube URL of this video (for Most Replayed data)"
                className={field}
              />
              <button
                onClick={() => findMoments("youtube")}
                disabled={busySource !== null || !ytUrl.trim()}
                className="shrink-0 rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                {busySource === "youtube" ? "Fetching…" : "▶ Most replayed"}
              </button>
            </div>
            <p className="mt-2 text-xs text-fog/40">
              Loudest = audio peaks (free, instant). AI scan = transcript-based
              funny/hype moments. Most replayed = YouTube's own viewer heat map.
            </p>

            {video.highlights && video.highlights.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {video.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span
                      title={SOURCE_BADGE[h.source].name}
                      className="w-5 text-center text-xs"
                    >
                      {SOURCE_BADGE[h.source].icon}
                    </span>
                    <button
                      onClick={() => seekTo(h.time)}
                      className="shrink-0 font-mono text-brand hover:underline"
                    >
                      {fmt(h.time)}
                    </button>
                    {h.label ? (
                      <span className="min-w-0 flex-1 truncate text-fog/70">
                        {h.label}
                      </span>
                    ) : (
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-border">
                        <div
                          className="h-full bg-brand"
                          style={{ width: `${Math.round(h.score * 100)}%` }}
                        />
                      </div>
                    )}
                    <button onClick={() => useHighlight(h)} className={smallBtn}>
                      Use
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Clip builder */}
        <section className="h-fit rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Cut a clip
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-fog/50">Start (s)</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className={field}
                />
                <button
                  onClick={() => setStart(Math.round(currentTime() * 10) / 10)}
                  title="Use player position"
                  className={smallBtn}
                >
                  now
                </button>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">End (s)</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className={field}
                />
                <button
                  onClick={() => setEnd(Math.round(currentTime() * 10) / 10)}
                  title="Use player position"
                  className={smallBtn}
                >
                  now
                </button>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">Framing</span>
              <select
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as "crop" | "blur")}
                className={field}
              >
                <option value="crop">Center crop to 9:16</option>
                <option value="blur">Full frame + blurred background</option>
              </select>
            </label>
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <label className="flex items-center gap-2 text-fog/80">
                <input
                  type="checkbox"
                  checked={captions}
                  onChange={(e) => setCaptions(e.target.checked)}
                  className="h-4 w-4 accent-[#2dd4bf]"
                />
                <span>Burn captions</span>
              </label>
              <label className="flex items-center gap-2 text-fog/80">
                <input
                  type="checkbox"
                  checked={endCard}
                  onChange={(e) => setEndCard(e.target.checked)}
                  className="h-4 w-4 accent-[#2dd4bf]"
                />
                <span>Outro card</span>
              </label>
            </div>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-fog/50">
              Notes for the hook writer (what happens, who's in it…)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. buzzer beater from half court to win the game"
              className={`mt-1 ${field}`}
            />
          </label>
          <button
            onClick={createClip}
            disabled={creating}
            className="mt-4 w-full rounded-lg bg-brand py-2.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
          >
            {creating ? "Queuing…" : `Create clip (${fmt(start)} → ${fmt(end)})`}
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </section>
      </div>

      {/* Clips */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          Clips
        </h2>
        {video.clips.length === 0 ? (
          <p className="text-sm text-fog/40">No clips yet — cut one above.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...video.clips]
              .sort(
                (a, b) => (b.brainScore?.score ?? -1) - (a.brainScore?.score ?? -1)
              )
              .map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  canPost={canPost}
                  minScore={minScore}
                  experiments={experiments}
                  onChanged={load}
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
  canPost,
  minScore,
  experiments,
  onChanged,
  onDelete,
  onRegenerate,
}: {
  clip: Clip;
  canPost: boolean;
  minScore: number;
  experiments: Experiment[];
  onChanged: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [m, setM] = useState({
    views: clip.metrics?.views ?? 0,
    likes: clip.metrics?.likes ?? 0,
    reposts: clip.metrics?.reposts ?? 0,
  });
  const busy = clip.status !== "ready" && clip.status !== "error";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}/post`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Post failed");
      onChanged();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function saveMetrics() {
    await fetch(`/api/clips/${clip.id}/metrics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    onChanged();
  }

  const experiment = experiments.find((e) => e.id === clip.experimentId);
  const heldByGate =
    clip.status === "ready" &&
    !clip.posted &&
    clip.autoPost &&
    minScore > 0 &&
    clip.brainScore &&
    clip.brainScore.score < minScore;

  return (
    <div className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-mono font-semibold text-fog">
          {fmt(clip.start)} → {fmt(clip.end)}
        </span>
        <span className="flex items-center gap-2">
          {clip.brainScore && (
            <span
              title={clip.brainScore.reason}
              className={
                "rounded-full px-2 py-0.5 text-xs font-bold " +
                (clip.brainScore.score >= 70
                  ? "bg-brand/15 text-brand"
                  : clip.brainScore.score >= 40
                    ? "bg-ink-border text-fog/70"
                    : "bg-red-500/15 text-red-400")
              }
            >
              🧠 {clip.brainScore.score}
            </span>
          )}
          <span
            className={
              clip.status === "ready"
                ? "font-semibold text-brand"
                : clip.status === "error"
                  ? "text-red-400"
                  : "animate-pulse text-fog/60"
            }
          >
            {STATUS_LABEL[clip.status] ?? clip.status}
          </span>
        </span>
      </div>
      {clip.brainScore && (
        <p className="mt-1 text-xs text-fog/50">{clip.brainScore.reason}</p>
      )}
      {experiment && (
        <p className="mt-1 text-xs text-fog/50">
          🧪 Testing: <span className="text-fog/70">{experiment.hypothesis}</span>
        </p>
      )}
      {heldByGate && (
        <p className="mt-1 text-xs text-amber-400">
          Held for review — scored {clip.brainScore!.score}, below your auto-post
          bar of {minScore}.
        </p>
      )}
      {clip.error && <p className="mt-1 text-xs text-red-400">{clip.error}</p>}

      {clip.file && !busy && (
        <video
          src={`/api/media/${clip.file}`}
          controls
          className="mt-3 max-h-96 w-full rounded-xl border border-ink-border bg-black"
        />
      )}

      {clip.hooks && clip.hooks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Hook options
          </h3>
          <ul className="mt-1 space-y-1">
            {clip.hooks.map((hook, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-fog/90">{hook}</span>
                <button
                  onClick={() => copy(hook, `hook-${i}`)}
                  className="shrink-0 rounded bg-ink-border px-2 py-0.5 text-xs text-fog transition hover:bg-brand hover:text-ink"
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
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Caption
          </h3>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-ink p-2 text-sm text-fog/90">
            {clip.caption}
          </p>
          <button
            onClick={() => copy(clip.caption!, "caption")}
            className="mt-1 rounded bg-ink-border px-2 py-0.5 text-xs text-fog transition hover:bg-brand hover:text-ink"
          >
            {copied === "caption" ? "Copied!" : "Copy caption"}
          </button>
        </div>
      )}

      {/* Posting + performance */}
      {clip.status === "ready" && clip.file && (
        <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
          {clip.posted ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={clip.posted.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                Posted to X ↗
              </a>
              <span className="text-xs text-fog/40">
                {new Date(clip.posted.at).toLocaleString()}
              </span>
            </div>
          ) : canPost ? (
            <button
              onClick={post}
              disabled={posting}
              className="rounded-lg bg-brand px-4 py-1.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post to X"}
            </button>
          ) : (
            <span className="text-xs text-fog/40">
              Add X API keys in .env.local to post from here — or download and
              post manually, then record the numbers below.
            </span>
          )}
          {postError && <p className="mt-1 text-xs text-red-400">{postError}</p>}

          <div className="mt-2 flex flex-wrap items-end gap-2">
            {(["views", "likes", "reposts"] as const).map((k) => (
              <label key={k} className="space-y-0.5">
                <span className="block text-[10px] uppercase tracking-wider text-fog/40">
                  {k}
                </span>
                <input
                  type="number"
                  min={0}
                  value={m[k]}
                  onChange={(e) => setM({ ...m, [k]: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
                />
              </label>
            ))}
            <button
              onClick={saveMetrics}
              className="rounded-lg bg-ink-border px-3 py-1.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink"
            >
              Save numbers
            </button>
            {clip.metrics && (
              <span className="text-[10px] text-fog/30">
                saved {new Date(clip.metrics.updatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-sm">
        {clip.file && !busy && (
          <a
            href={`/api/media/${clip.file}`}
            download={`clip-${clip.id}.mp4`}
            className="rounded-lg bg-brand px-4 py-1.5 font-bold text-ink transition hover:bg-brand-dim"
          >
            Download
          </a>
        )}
        {clip.status === "ready" && (
          <>
            <button
              onClick={onRegenerate}
              className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink"
            >
              Regenerate hooks
            </button>
            <button
              onClick={async () => {
                await fetch(`/api/clips/${clip.id}/score`, { method: "POST" });
                onChanged();
              }}
              title="Re-run the Brain's performance prediction"
              className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink"
            >
              Rescore
            </button>
          </>
        )}
        <button
          onClick={onDelete}
          className="ml-auto rounded-lg px-2 py-1.5 text-fog/40 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
