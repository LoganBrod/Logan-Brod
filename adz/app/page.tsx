"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Playbook {
  updatedAt: string;
  summary: string;
  creativeGuidelines: string;
  visualGuidelines: string;
  avoid: string;
  experiments?: { id: string; hypothesis: string; instruction: string }[];
  experimentResults?: string;
}

interface SeedAd {
  id: string;
  description: string;
  source?: string;
  stats?: string;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <ProductPanel />
      <GeneratePanel />
      <BrainPanel />
    </div>
  );
}

function ProductPanel() {
  const [p, setP] = useState({ product: "", audience: "", offer: "", voice: "" });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setP({ product: s.product, audience: s.audience, offer: s.offer, voice: s.voice });
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  async function save() {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (res.ok) setSaved(true);
  }

  if (!loaded) return null;
  return (
    <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
      <h1 className="text-xl font-extrabold text-fog">What are you selling?</h1>
      <p className="mt-1 text-sm text-fog/60">
        Every graded and generated ad is anchored to this — be specific.
      </p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-fog/50">Product</span>
          <textarea
            rows={2}
            value={p.product}
            onChange={(e) => { setP({ ...p, product: e.target.value }); setSaved(false); }}
            placeholder="e.g. Magnetic phone mount for cars — one-hand dock, holds through potholes, $24.99"
            className={field}
          />
        </label>
        <label className="space-y-1">
          <span className="text-fog/50">Audience</span>
          <input
            value={p.audience}
            onChange={(e) => { setP({ ...p, audience: e.target.value }); setSaved(false); }}
            placeholder="e.g. commuters 25-45 who use maps daily"
            className={field}
          />
        </label>
        <label className="space-y-1">
          <span className="text-fog/50">Offer</span>
          <input
            value={p.offer}
            onChange={(e) => { setP({ ...p, offer: e.target.value }); setSaved(false); }}
            placeholder="e.g. 20% off first order + free shipping"
            className={field}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-fog/50">Brand voice</span>
          <input
            value={p.voice}
            onChange={(e) => { setP({ ...p, voice: e.target.value }); setSaved(false); }}
            className={field}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim"
        >
          Save product
        </button>
        {saved && <span className="text-sm text-brand">Saved ✓</span>}
      </div>
    </section>
  );
}

function GeneratePanel() {
  const router = useRouter();
  const [format, setFormat] = useState<"image" | "video">("image");
  const [count, setCount] = useState(2);
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, count, angle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      router.push("/ads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-brand/30 bg-ink-card p-6 shadow-card">
      <h2 className="text-lg font-extrabold text-fog">
        Generate ads <span className="text-brand">· from what converts</span>
      </h2>
      <p className="mt-1 text-sm text-fog/60">
        New drafts follow the playbook, get Brain-scored, and their visuals
        (and video + voiceover) are generated automatically.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-fog/50">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "image" | "video")}
            className={field}
          >
            <option value="image">Image ad</option>
            <option value="video">Video ad (scenes + voiceover)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-fog/50">How many</span>
          <input
            type="number"
            min={1}
            max={3}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-20 rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog focus:border-brand focus:outline-none"
          />
        </label>
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-fog/50">Angle / notes (optional)</span>
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="e.g. lean into the frustration of dropped phones"
            className={field}
          />
        </label>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-brand px-6 py-2 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
        >
          {busy ? "Generating… (can take a minute)" : "Generate"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function BrainPanel() {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedAd[]>([]);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDesc, setSeedDesc] = useState("");
  const [seedSource, setSeedSource] = useState("");
  const [seedStats, setSeedStats] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evolve").then((r) => r.json()).then(setPlaybook).catch(() => {});
    fetch("/api/seeds").then((r) => r.json()).then(setSeeds).catch(() => {});
  }, []);

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
            Brain <span className="text-brand">· learns what converts</span>
          </h2>
          <p className="text-sm text-fog/60">
            Import ads with their real numbers (or pre-feed reference winners),
            then analyze — the playbook steers grading and generation.
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
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 rounded-xl border border-ink-border bg-ink p-3 text-sm">
        <button
          onClick={() => setSeedOpen(!seedOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="font-semibold text-fog">
            Pre-feed the Brain{" "}
            <span className="text-xs font-normal text-fog/40">
              — {seeds.length} reference ad{seeds.length === 1 ? "" : "s"}.
              Describe winning ads in your niche to bootstrap the playbook.
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
              placeholder="e.g. 'UGC-style video: girl drops phone getting out of car, cuts to mount holding through speed bumps. Hook: your phone shouldn't be a passenger. 15s, ran for months.'"
              className={`${field} bg-ink-card`}
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={seedSource}
                onChange={(e) => setSeedSource(e.target.value)}
                placeholder="Link (optional)"
                className={`${field} min-w-0 flex-1 bg-ink-card`}
              />
              <input
                value={seedStats}
                onChange={(e) => setSeedStats(e.target.value)}
                placeholder="Stats (optional), e.g. ran 6 months"
                className={`${field} w-52 bg-ink-card`}
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
          </div>
        )}
      </div>

      {playbook && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-ink p-3 sm:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              What's converting
            </h3>
            <p className="mt-1 text-fog/80">{playbook.summary}</p>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Creative
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-fog/70">
              {playbook.creativeGuidelines}
            </p>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Visuals
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-fog/70">
              {playbook.visualGuidelines}
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
                      Variant ads: “{e.instruction}”
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fog/40">
                Generated ads rotate between these variants and a control group —
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
