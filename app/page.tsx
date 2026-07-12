"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface VideoRow {
  id: string;
  filename: string;
  duration: number;
  clipCount: number;
  createdAt: string;
}

interface PromoSettings {
  enabled: boolean;
  headline: string;
  main: string;
  subline: string;
  socials: string;
  footer: string;
  accent: string;
  durationSec: number;
}

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/videos");
    if (res.ok) setVideos(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this video and all of its clips?")) return;
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h1 className="text-xl font-extrabold text-fog">Upload footage</h1>
        <p className="mt-1 text-sm text-fog/60">
          Streams, sports, podcasts, YouTube VODs — drop in anything long. Find
          the moments, cut vertical clips with captions, get hooks ready to post.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="text-sm text-fog/70 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-border file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fog hover:file:bg-ink-border/70"
          />
          <button
            onClick={upload}
            disabled={uploading}
            className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <OutroSettingsPanel />

      <BrainPanel />

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          Your footage
        </h2>
        {videos.length === 0 ? (
          <p className="text-sm text-fog/40">Nothing uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-2xl border border-ink-border bg-ink-card px-4 py-3 transition hover:border-brand/40"
              >
                <div className="min-w-0">
                  <Link
                    href={`/video/${v.id}`}
                    className="block truncate font-semibold text-fog hover:text-brand"
                  >
                    {v.filename}
                  </Link>
                  <p className="text-xs text-fog/50">
                    {fmtDuration(v.duration)} · {v.clipCount} clip
                    {v.clipCount === 1 ? "" : "s"} ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/video/${v.id}`}
                    className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-brand-dim"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => remove(v.id)}
                    className="rounded-lg px-2 py-1.5 text-sm text-fog/40 hover:text-red-400"
                  >
                    Delete
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

interface Playbook {
  updatedAt: string;
  summary: string;
  momentGuidelines: string;
  hookGuidelines: string;
  avoid: string;
  experiments?: { id: string; hypothesis: string; instruction: string }[];
  experimentResults?: string;
}

interface SeedClip {
  id: string;
  description: string;
  source?: string;
  stats?: string;
}

function BrainPanel() {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [autoPost, setAutoPostState] = useState(false);
  const [minScore, setMinScoreState] = useState(0);
  const [canPost, setCanPost] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedClip[]>([]);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDesc, setSeedDesc] = useState("");
  const [seedSource, setSeedSource] = useState("");
  const [seedStats, setSeedStats] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evolve").then((r) => r.json()).then(setPlaybook).catch(() => {});
    fetch("/api/seeds").then((r) => r.json()).then(setSeeds).catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setAutoPostState(Boolean(s.autoPost));
        setMinScoreState(Number(s.minScore) || 0);
        setCanPost(Boolean(s.canPost));
      })
      .catch(() => {});
  }, []);

  async function toggleAutoPost(value: boolean) {
    setAutoPostState(value);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoPost: value }),
    });
  }

  async function saveMinScore(value: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(value) || 0));
    setMinScoreState(clamped);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minScore: clamped }),
    });
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/evolve", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setPlaybook(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function addSeed() {
    setSeedError(null);
    const res = await fetch("/api/seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: seedDesc, source: seedSource, stats: seedStats }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSeedError(data.error ?? "Couldn't add reference");
      return;
    }
    setSeeds(data);
    setSeedDesc("");
    setSeedSource("");
    setSeedStats("");
  }

  async function removeSeed(id: string) {
    const res = await fetch(`/api/seeds?id=${id}`, { method: "DELETE" });
    if (res.ok) setSeeds(await res.json());
  }

  return (
    <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-fog">
            Brain <span className="text-brand">· learns what performs</span>
          </h2>
          <p className="text-sm text-fog/60">
            Add views/likes to posted clips, then analyze — the playbook steers
            the AI scanner, the live clipper's picks, and the hook writer.
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={analyzing}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
        >
          {analyzing ? "Analyzing…" : "Analyze performance"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fog/80">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoPost}
            onChange={(e) => toggleAutoPost(e.target.checked)}
            className="h-4 w-4 accent-[#2dd4bf]"
          />
          Auto-post clips to X when ready
          {!canPost && (
            <span className="text-xs text-fog/40">
              (add X API keys to .env.local to enable — until then clips wait
              for approval)
            </span>
          )}
        </label>
        <label className="flex items-center gap-2">
          Only auto-post clips the Brain scores ≥
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => saveMinScore(Number(e.target.value))}
            className="w-16 rounded-lg border border-ink-border bg-ink px-2 py-1 text-fog focus:border-brand focus:outline-none"
          />
          <span className="text-xs text-fog/40">(0 = post everything)</span>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {/* Pre-feed with reference viral clips */}
      <div className="mt-4 rounded-xl border border-ink-border bg-ink p-3 text-sm">
        <button
          onClick={() => setSeedOpen(!seedOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="font-semibold text-fog">
            Pre-feed the Brain{" "}
            <span className="text-xs font-normal text-fog/40">
              — {seeds.length} reference clip{seeds.length === 1 ? "" : "s"}.
              Describe viral clips you want to emulate; the Brain builds its
              starter playbook from them before you have numbers of your own.
            </span>
          </span>
          <span className="text-fog/40">{seedOpen ? "▲" : "▼"}</span>
        </button>

        {seedOpen && (
          <div className="mt-3 space-y-3">
            <textarea
              value={seedDesc}
              onChange={(e) => setSeedDesc(e.target.value)}
              rows={2}
              maxLength={600}
              placeholder="What happens + why it works, e.g. 'Streamer bets last $50, wins 800x — screams, chair falls over. Hook text: HE HAD $50 LEFT. 14 seconds, caption asks would you have cashed out.'"
              className="w-full rounded-lg border border-ink-border bg-ink-card px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={seedSource}
                onChange={(e) => setSeedSource(e.target.value)}
                placeholder="Link (optional)"
                className="min-w-0 flex-1 rounded-lg border border-ink-border bg-ink-card px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none"
              />
              <input
                value={seedStats}
                onChange={(e) => setSeedStats(e.target.value)}
                placeholder="Stats (optional), e.g. 2.1M views"
                className="w-48 rounded-lg border border-ink-border bg-ink-card px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none"
              />
              <button
                onClick={addSeed}
                disabled={seedDesc.trim().length < 10}
                className="rounded-lg bg-brand px-4 py-1.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {seedError && <p className="text-xs text-red-400">{seedError}</p>}
            {seeds.length > 0 && (
              <ul className="space-y-1.5">
                {seeds.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="min-w-0 flex-1 text-fog/70">
                      {s.description}
                      {s.stats && <span className="text-brand"> · {s.stats}</span>}
                      {s.source && (
                        <a
                          href={s.source}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-fog/40 underline hover:text-brand"
                        >
                          link
                        </a>
                      )}
                    </span>
                    <button
                      onClick={() => removeSeed(s.id)}
                      className="shrink-0 text-fog/40 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fog/40">
              Add 3+ then hit Analyze — works before you've posted anything.
              Once your own clips have numbers, your real data outweighs these.
            </p>
          </div>
        )}
      </div>

      {playbook && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-ink p-3 sm:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              What's working
            </h3>
            <p className="mt-1 text-fog/80">{playbook.summary}</p>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Moment picks
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-fog/70">
              {playbook.momentGuidelines}
            </p>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Hooks & captions
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-fog/70">
              {playbook.hookGuidelines}
            </p>
          </div>
          <div className="rounded-xl bg-ink p-3 sm:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Avoiding
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-fog/70">{playbook.avoid}</p>
          </div>
          {playbook.experiments && playbook.experiments.length > 0 && (
            <div className="rounded-xl border border-brand/30 bg-ink p-3 sm:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
                🧪 Running experiments
              </h3>
              <ul className="mt-1 space-y-1.5">
                {playbook.experiments.map((e) => (
                  <li key={e.id} className="text-fog/80">
                    {e.hypothesis}
                    <span className="block text-xs text-fog/40">
                      Variant clips: “{e.instruction}”
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fog/40">
                New clips rotate between these variants and a control group —
                the next analysis declares winners.
              </p>
            </div>
          )}
          {playbook.experimentResults && (
            <div className="rounded-xl bg-ink p-3 sm:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                Last experiment results
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-fog/70">
                {playbook.experimentResults}
              </p>
            </div>
          )}
          <p className="text-xs text-fog/40 sm:col-span-2">
            Last analyzed {new Date(playbook.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

function OutroSettingsPanel() {
  const [promo, setPromo] = useState<PromoSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setPromo)
      .catch(() => {});
  }, []);

  if (!promo) return null;

  function set<K extends keyof PromoSettings>(key: K, value: PromoSettings[K]) {
    setPromo((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promo),
      });
      if (res.ok) {
        setPromo(await res.json());
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none";

  return (
    <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-lg font-extrabold text-fog">Outro card</h2>
          <p className="text-sm text-fog/60">
            The follow screen at the end of each clip — handle, socials, promo.
          </p>
        </div>
        <span className="text-fog/40">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <label className="mt-4 flex items-center gap-2 text-sm text-fog/80">
            <input
              type="checkbox"
              checked={promo.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="h-4 w-4 accent-[#2dd4bf]"
            />
            Add to new clips by default
          </label>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-fog/50">Headline (small, top)</span>
              <input
                value={promo.headline}
                maxLength={40}
                placeholder="ENJOYED THIS?"
                onChange={(e) => set("headline", e.target.value)}
                className={field}
              />
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">Main line (big, accent)</span>
              <input
                value={promo.main}
                maxLength={40}
                placeholder="@yourname or CODE: xyz"
                onChange={(e) => set("main", e.target.value)}
                className={field}
              />
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">Subline</span>
              <input
                value={promo.subline}
                maxLength={80}
                placeholder="Live every day at 7PM EST"
                onChange={(e) => set("subline", e.target.value)}
                className={field}
              />
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">Socials row</span>
              <input
                value={promo.socials}
                maxLength={100}
                placeholder="twitch.tv/you · kick.com/you · youtube.com/@you"
                onChange={(e) => set("socials", e.target.value)}
                className={field}
              />
            </label>
            <label className="space-y-1">
              <span className="text-fog/50">
                Footer (optional — e.g. “18+ | Gamble responsibly”)
              </span>
              <input
                value={promo.footer}
                maxLength={80}
                placeholder="Leave empty for none"
                onChange={(e) => set("footer", e.target.value)}
                className={field}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-fog/50">Accent</span>
                <input
                  type="color"
                  value={promo.accent}
                  onChange={(e) => set("accent", e.target.value)}
                  className="block h-9 w-full cursor-pointer rounded-lg border border-ink-border bg-ink"
                />
              </label>
              <label className="space-y-1">
                <span className="text-fog/50">Seconds</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={promo.durationSec}
                  onChange={(e) => set("durationSec", Number(e.target.value))}
                  className={field}
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-4">
            <div className="flex aspect-[9/16] w-36 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-ink-border bg-[#141b1d] px-2 text-center">
              {promo.headline && (
                <span className="text-[8px] font-semibold text-fog">
                  {promo.headline}
                </span>
              )}
              {promo.main && (
                <span
                  className="text-[15px] font-extrabold leading-tight"
                  style={{ color: promo.accent }}
                >
                  {promo.main}
                </span>
              )}
              {promo.subline && (
                <span className="text-[7px] text-fog/70">{promo.subline}</span>
              )}
              {promo.socials && (
                <>
                  <span
                    className="mt-1 block h-[2px] w-8 rounded-full"
                    style={{ background: promo.accent }}
                  />
                  <span className="text-[6px] text-fog/50">{promo.socials}</span>
                </>
              )}
              {promo.footer && (
                <span className="mt-2 text-[6px] text-fog/40">{promo.footer}</span>
              )}
            </div>
            <div className="text-xs text-fog/40">
              Preview (approximate). Fades in for {promo.durationSec}s at the end
              of each clip. When enabled, the main line is also woven into the AI
              captions.
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save outro"}
            </button>
            {saved && <span className="text-sm text-brand">Saved ✓</span>}
          </div>
        </>
      )}
    </section>
  );
}
