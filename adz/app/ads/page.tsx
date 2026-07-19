"use client";

import { useCallback, useEffect, useState } from "react";

interface Scene {
  visual: string;
  voiceover: string;
  overlayText: string;
}

interface Ad {
  id: string;
  name: string;
  platform: string;
  format: "image" | "video";
  status: "draft" | "active" | "ended";
  source: "imported" | "generated";
  creative: {
    headline: string;
    primaryText: string;
    cta: string;
    visualDescription: string;
    videoScript?: Scene[];
  };
  metrics?: {
    impressions: number;
    clicks: number;
    spend: number;
    purchases: number;
    revenue: number;
  };
  brainScore?: { score: number; reason: string };
  experimentId?: string;
  assets?: {
    status: string;
    error?: string;
    images: string[];
    video?: string;
  };
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none";

function derived(m?: Ad["metrics"]) {
  if (!m) return null;
  return {
    ctr: m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : null,
    cvr: m.clicks > 0 ? ((m.purchases / m.clicks) * 100).toFixed(2) : null,
    roas: m.spend > 0 ? (m.revenue / m.spend).toFixed(2) : null,
  };
}

export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/ads");
    if (res.ok) setAds(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generating = ads.some(
    (a) => a.assets?.status === "generating" || (!a.brainScore && a.source === "generated")
  );
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [generating, load]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <button
          onClick={() => setImportOpen(!importOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h1 className="text-xl font-extrabold text-fog">Import a past ad</h1>
            <p className="text-sm text-fog/60">
              Feed the Brain your ad history — creative + real numbers.
            </p>
          </div>
          <span className="text-fog/40">{importOpen ? "▲" : "▼"}</span>
        </button>
        {importOpen && <ImportForm onDone={() => load()} />}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          Ads
        </h2>
        {ads.length === 0 ? (
          <p className="text-sm text-fog/40">
            Nothing yet — import your past ads above, or generate new ones from
            the Brain page.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...ads]
              .sort((a, b) => (b.brainScore?.score ?? -1) - (a.brainScore?.score ?? -1))
              .map((ad) => (
                <AdCard key={ad.id} ad={ad} onChanged={load} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({
    name: "",
    platform: "meta",
    format: "image",
    headline: "",
    primaryText: "",
    cta: "",
    visualDescription: "",
    impressions: "",
    clicks: "",
    spend: "",
    purchases: "",
    revenue: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          metrics: {
            impressions: f.impressions,
            clicks: f.clicks,
            spend: f.spend,
            purchases: f.purchases,
            revenue: f.revenue,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setF({ ...f, name: "", headline: "", primaryText: "", visualDescription: "", impressions: "", clicks: "", spend: "", purchases: "", revenue: "" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ad name" className={field} />
      <div className="grid grid-cols-2 gap-3">
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} className={field}>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
          <option value="x">X</option>
          <option value="google">Google</option>
          <option value="other">Other</option>
        </select>
        <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} className={field}>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </div>
      <input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Headline" className={field} />
      <input value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} placeholder="CTA (e.g. Shop now)" className={field} />
      <textarea rows={2} value={f.primaryText} onChange={(e) => setF({ ...f, primaryText: e.target.value })} placeholder="Primary text / caption" className={`${field} sm:col-span-2`} />
      <textarea rows={2} value={f.visualDescription} onChange={(e) => setF({ ...f, visualDescription: e.target.value })} placeholder="What the visual shows (describe the image/video)" className={`${field} sm:col-span-2`} />
      <div className="grid grid-cols-5 gap-2 sm:col-span-2">
        {(["impressions", "clicks", "spend", "purchases", "revenue"] as const).map((k) => (
          <label key={k} className="space-y-0.5">
            <span className="block text-[10px] uppercase tracking-wider text-fog/40">{k}</span>
            <input
              type="number"
              min={0}
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
              className={field}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 sm:col-span-2">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !f.name.trim() || !f.headline.trim()}
        className="rounded-lg bg-brand px-6 py-2 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50 sm:col-span-2"
      >
        {busy ? "Importing…" : "Import ad"}
      </button>
    </div>
  );
}

function AdCard({ ad, onChanged }: { ad: Ad; onChanged: () => void }) {
  const [m, setM] = useState({
    impressions: ad.metrics?.impressions ?? 0,
    clicks: ad.metrics?.clicks ?? 0,
    spend: ad.metrics?.spend ?? 0,
    purchases: ad.metrics?.purchases ?? 0,
    revenue: ad.metrics?.revenue ?? 0,
  });
  const [copied, setCopied] = useState(false);
  const d = derived(ad.metrics);

  async function saveMetrics() {
    await fetch(`/api/ads/${ad.id}/metrics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    onChanged();
  }

  async function act(url: string, method = "POST") {
    await fetch(url, { method });
    onChanged();
  }

  function copyAll() {
    navigator.clipboard
      .writeText(
        `${ad.creative.headline}\n\n${ad.creative.primaryText}\n\nCTA: ${ad.creative.cta}`
      )
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <div className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-fog">{ad.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          {ad.brainScore && (
            <span
              title={ad.brainScore.reason}
              className={
                "rounded-full px-2 py-0.5 text-xs font-bold " +
                (ad.brainScore.score >= 70
                  ? "bg-brand/15 text-brand"
                  : ad.brainScore.score >= 40
                    ? "bg-ink-border text-fog/70"
                    : "bg-red-500/15 text-red-400")
              }
            >
              🧠 {ad.brainScore.score}
            </span>
          )}
          <select
            value={ad.status}
            onChange={(e) =>
              fetch(`/api/ads/${ad.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: e.target.value }),
              }).then(onChanged)
            }
            className="rounded-lg border border-ink-border bg-ink px-1.5 py-0.5 text-xs text-fog"
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="ended">ended</option>
          </select>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-fog/40">
        {ad.platform} · {ad.format} · {ad.source}
        {ad.experimentId && ad.experimentId !== "control" && " · 🧪 " + ad.experimentId}
      </p>
      {ad.brainScore && (
        <p className="mt-1 text-xs text-fog/50">{ad.brainScore.reason}</p>
      )}

      <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
        <p className="font-bold text-fog">{ad.creative.headline}</p>
        <p className="mt-1 whitespace-pre-wrap text-fog/80">{ad.creative.primaryText}</p>
        <p className="mt-1 text-xs text-fog/50">CTA: {ad.creative.cta}</p>
        <button
          onClick={copyAll}
          className="mt-2 rounded bg-ink-border px-2 py-0.5 text-xs text-fog transition hover:bg-brand hover:text-ink"
        >
          {copied ? "Copied!" : "Copy copy"}
        </button>
      </div>

      {/* Assets */}
      {ad.assets?.status === "generating" && (
        <p className="mt-2 animate-pulse text-xs text-fog/60">
          Generating assets… ({ad.assets.images.length} visual
          {ad.assets.images.length === 1 ? "" : "s"} done)
        </p>
      )}
      {ad.assets?.status === "error" && (
        <p className="mt-2 text-xs text-red-400">Assets failed: {ad.assets.error}</p>
      )}
      {ad.assets?.video ? (
        <video
          src={`/api/media/${ad.assets.video}`}
          controls
          className="mt-3 max-h-96 w-full rounded-xl border border-ink-border bg-black"
        />
      ) : ad.assets && ad.assets.images.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {ad.assets.images.map((img) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={img}
              src={`/api/media/${img}`}
              alt=""
              className="h-56 rounded-xl border border-ink-border"
            />
          ))}
        </div>
      ) : null}

      {ad.creative.videoScript && ad.creative.videoScript.length > 0 && (
        <details className="mt-2 text-xs text-fog/60">
          <summary className="cursor-pointer font-semibold text-fog/70">Script</summary>
          <ul className="mt-1 space-y-1">
            {ad.creative.videoScript.map((s, i) => (
              <li key={i}>
                <span className="text-fog/40">Scene {i + 1}:</span> [{s.visual}] —
                “{s.voiceover}” <span className="text-brand">{s.overlayText}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Metrics */}
      <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
        {d && (d.ctr || d.roas) && (
          <p className="mb-2 text-xs text-fog/70">
            {d.ctr && <>CTR <span className="font-bold text-brand">{d.ctr}%</span> · </>}
            {d.cvr && <>CVR <span className="font-bold text-brand">{d.cvr}%</span> · </>}
            {d.roas && <>ROAS <span className="font-bold text-brand">{d.roas}x</span></>}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {(["impressions", "clicks", "spend", "purchases", "revenue"] as const).map((k) => (
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
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button
          onClick={() => act(`/api/ads/${ad.id}/score`)}
          className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink"
        >
          {ad.brainScore ? "Rescore" : "Score"}
        </button>
        {ad.source === "generated" && ad.assets?.status !== "generating" && (
          <button
            onClick={() => act(`/api/ads/${ad.id}/assets`)}
            className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink"
          >
            {ad.assets?.status === "ready" ? "Rebuild assets" : "Build assets"}
          </button>
        )}
        <button
          onClick={() => {
            if (confirm("Delete this ad?")) act(`/api/ads/${ad.id}`, "DELETE");
          }}
          className="ml-auto rounded-lg px-2 py-1.5 text-fog/40 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
