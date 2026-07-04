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
  code: string;
  subline: string;
  accent: string;
  durationSec: number;
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
    <div className="space-y-8">
      <section className="rounded-xl border border-ink-border bg-ink-card p-6">
        <h1 className="text-xl font-bold">Upload raw footage</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Drop in a VOD or session recording. Then detect the big moments, cut
          vertical clips with captions, and get AI hooks + captions to post.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-border file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand/60"
          />
          <button
            onClick={upload}
            disabled={uploading}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <PromoSettingsPanel />

      <section>
        <h2 className="mb-3 text-lg font-bold">Your footage</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-ink-border bg-ink-card px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/video/${v.id}`}
                    className="block truncate font-semibold hover:text-brand"
                  >
                    {v.filename}
                  </Link>
                  <p className="text-xs text-neutral-400">
                    {fmtDuration(v.duration)} · {v.clipCount} clip
                    {v.clipCount === 1 ? "" : "s"} ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/video/${v.id}`}
                    className="rounded-lg bg-ink-border px-3 py-1.5 text-sm font-semibold hover:bg-brand/60"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => remove(v.id)}
                    className="rounded-lg px-2 py-1.5 text-sm text-neutral-500 hover:text-red-400"
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

function PromoSettingsPanel() {
  const [promo, setPromo] = useState<PromoSettings | null>(null);
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

  return (
    <section className="rounded-xl border border-ink-border bg-ink-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Promo end card</h2>
          <p className="text-sm text-neutral-400">
            A short screen appended to each clip with your code / leaderboard.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={promo.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="h-4 w-4 accent-[#8b5cf6]"
          />
          Enabled by default
        </label>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-neutral-400">Headline</span>
          <input
            value={promo.headline}
            maxLength={60}
            onChange={(e) => set("headline", e.target.value)}
            className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Code line (big, accent color)</span>
          <input
            value={promo.code}
            maxLength={40}
            onChange={(e) => set("code", e.target.value)}
            className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Subline (leaderboard, link…)</span>
          <input
            value={promo.subline}
            maxLength={80}
            onChange={(e) => set("subline", e.target.value)}
            className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-neutral-400">Accent</span>
            <input
              type="color"
              value={promo.accent}
              onChange={(e) => set("accent", e.target.value)}
              className="block h-9 w-full cursor-pointer rounded-lg border border-ink-border bg-ink"
            />
          </label>
          <label className="space-y-1">
            <span className="text-neutral-400">Seconds</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={promo.durationSec}
              onChange={(e) => set("durationSec", Number(e.target.value))}
              className="w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5"
            />
          </label>
        </div>
      </div>

      {/* Live preview of the card layout */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex aspect-[9/16] w-32 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-ink-border bg-[#0e0e16] px-2 text-center">
          {promo.headline && (
            <span className="text-[9px] font-bold text-white">{promo.headline}</span>
          )}
          {promo.code && (
            <span className="text-[13px] font-extrabold" style={{ color: promo.accent }}>
              {promo.code}
            </span>
          )}
          {promo.subline && (
            <span className="text-[7px] text-neutral-400">{promo.subline}</span>
          )}
          <span className="mt-2 text-[6px] text-neutral-500">
            18+ | Gamble responsibly
          </span>
        </div>
        <div className="text-xs text-neutral-500">
          Preview (approximate). The card fades in for {promo.durationSec}s at the
          end of each clip. The 18+ line is always included.
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save promo settings"}
        </button>
        {saved && <span className="text-sm text-green-400">Saved ✓</span>}
      </div>
    </section>
  );
}
