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
