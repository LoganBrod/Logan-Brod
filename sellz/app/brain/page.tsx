"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Reveal from "@/components/Reveal";
import { useToast } from "@/components/Toast";

interface Playbook {
  updatedAt: string;
  summary: string;
  listingGuidelines: string;
  pricingGuidelines: string;
  avoid: string;
  experiments?: { id: string; hypothesis: string; instruction: string }[];
  experimentResults?: string;
}

interface SeedListing {
  id: string;
  description: string;
  source?: string;
  stats?: string;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

export default function BrainPage() {
  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-extrabold text-fog"
      >
        The Brain
      </motion.h1>
      <SellerPanel />
      <BrainPanel />
    </div>
  );
}

function SellerPanel() {
  const toast = useToast();
  const [s, setS] = useState({ niche: "", platforms: "", shipping: "", style: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setS({ niche: d.niche, platforms: d.platforms, shipping: d.shipping, style: d.style });
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  async function save() {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (res.ok) toast.push("Saved");
  }

  if (!loaded) return null;
  return (
    <Reveal>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h2 className="text-lg font-extrabold text-fog">What do you sell?</h2>
        <p className="mt-1 text-sm text-fog/60">
          Every graded and generated listing is anchored to this.
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-fog/50">Niche</span>
            <textarea
              rows={2}
              value={s.niche}
              onChange={(e) => setS({ ...s, niche: e.target.value })}
              placeholder="e.g. Y2K and vintage streetwear — Nike, Carhartt, band tees, sizes M-XL"
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fog/50">Platforms</span>
            <input
              value={s.platforms}
              onChange={(e) => setS({ ...s, platforms: e.target.value })}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fog/50">Shipping</span>
            <input
              value={s.shipping}
              onChange={(e) => setS({ ...s, shipping: e.target.value })}
              placeholder="e.g. free US shipping, ships next day"
              className={field}
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-fog/50">Shop style</span>
            <input
              value={s.style}
              onChange={(e) => setS({ ...s, style: e.target.value })}
              className={field}
            />
          </label>
        </div>
        <div className="mt-4">
          <button
            onClick={save}
            className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim active:scale-95"
          >
            Save
          </button>
        </div>
      </section>
    </Reveal>
  );
}

function BrainPanel() {
  const toast = useToast();
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedListing[]>([]);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDesc, setSeedDesc] = useState("");
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
      toast.push("Playbook updated");
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
      body: JSON.stringify({ description: seedDesc, stats: seedStats }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSeedError(data.error ?? "Couldn't add reference");
      return;
    }
    setSeeds(data);
    setSeedDesc("");
    setSeedStats("");
  }

  async function removeSeed(id: string) {
    const res = await fetch(`/api/seeds?id=${id}`, { method: "DELETE" });
    if (res.ok) setSeeds(await res.json());
  }

  return (
    <Reveal index={1}>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-fog">
              Performance <span className="text-brand">· learns why things sell</span>
            </h2>
            <p className="text-sm text-fog/60">
              Import listings with outcomes — sold AND stuck — then analyze. The
              playbook steers grading, diagnosis, and every generated listing.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={analyze}
            disabled={analyzing}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze sales"}
          </motion.button>
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
                — {seeds.length} reference listing{seeds.length === 1 ? "" : "s"}.
                Describe listings in your niche that sold well to bootstrap the
                playbook.
              </span>
            </span>
            <span className="text-fog/40">{seedOpen ? "▲" : "▼"}</span>
          </button>
          {seedOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3 space-y-3 overflow-hidden"
            >
              <textarea
                value={seedDesc}
                onChange={(e) => setSeedDesc(e.target.value)}
                rows={2}
                maxLength={600}
                placeholder="e.g. 'Vintage Carhartt Detroit L, title led with brand+model+size, 12 photos incl. flaws close-up, priced $95 (comps 80-110), sold in 3 days with 8 watchers.'"
                className={`${field} bg-ink-card`}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  value={seedStats}
                  onChange={(e) => setSeedStats(e.target.value)}
                  placeholder="Stats (optional), e.g. sold in 3 days"
                  className={`${field} min-w-0 flex-1 bg-ink-card`}
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
            </motion.div>
          )}
        </div>

        {playbook && (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-ink p-3 sm:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
                Why things sell (and don't)
              </h3>
              <p className="mt-1 text-fog/80">{playbook.summary}</p>
            </div>
            <div className="rounded-xl bg-ink p-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                Listings
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-fog/70">
                {playbook.listingGuidelines}
              </p>
            </div>
            <div className="rounded-xl bg-ink p-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                Pricing
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-fog/70">
                {playbook.pricingGuidelines}
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
                        Variant listings: “{e.instruction}”
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-fog/40">
                  Generated listings rotate between these variants and a control
                  group — the next analysis declares winners.
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
    </Reveal>
  );
}
