"use client";

import { useCallback, useEffect, useState } from "react";
import { LETTER_SIZES, type Sizes } from "@/lib/sizing";

interface FitAdvice {
  recommendation: string;
  runs: "small" | "true" | "large" | "unknown";
  confidence: "high" | "medium" | "low";
  reasoning: string;
  cautions: string[];
  sources: string[];
}

interface FitRecord {
  brand: string;
  category: string;
  advice: FitAdvice;
  checkedAt: string;
}

interface State {
  configured: boolean;
  plan: "free" | "member";
  sizes: Sizes;
  hasSizes: boolean;
  history: FitRecord[];
}

/** The garments whose sizing differs enough between brands to be worth asking about. */
const GARMENTS = ["jacket", "coat", "knitwear", "shirt", "jeans", "trousers", "boots", "sneakers"];

const RUNS_COPY: Record<FitAdvice["runs"], string> = {
  small: "Runs small",
  true: "True to size",
  large: "Runs large",
  unknown: "Unclear",
};

const CONFIDENCE_COPY: Record<FitAdvice["confidence"], string> = {
  high: "from a published size chart",
  medium: "from consistent fit reports",
  low: "from thin evidence — treat with caution",
};

/**
 * Measurements, and what they mean at a particular brand.
 *
 * The measurements half is the highest-value input in the whole app and the one
 * thing that can't be learned from behaviour — no amount of watching someone
 * browse reveals their inseam. The brand half is the only feature that reads
 * the open web, which is why it's rationed and why every answer says how good
 * its evidence was.
 */
export default function SizingDesk() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Sizes>({});
  const [saved, setSaved] = useState(false);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState(GARMENTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/fit")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: State | null) => {
        if (!json) return;
        setState(json);
        setDraft(json.sizes);
      })
      .catch(() => setError("Couldn't load your measurements."));
  }, []);

  useEffect(load, [load]);

  async function saveSizes() {
    setError(null);
    try {
      const res = await fetch("/api/fit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't save those.");
      setState((current) => (current ? { ...current, sizes: json.sizes, hasSizes: json.hasSizes } : current));
      setDraft(json.sizes);
      setSaved(true);
      // Long enough to read, short enough not to linger over the next edit.
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those.");
    }
  }

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!brand.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), category }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't look that up.");
      setBrand("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't look that up.");
    } finally {
      setBusy(false);
    }
  }

  async function forget(record: FitRecord) {
    await fetch(
      `/api/fit?brand=${encodeURIComponent(record.brand)}&category=${encodeURIComponent(record.category)}`,
      { method: "DELETE" }
    ).catch(() => {});
    load();
  }

  const set = (patch: Partial<Sizes>) => setDraft((current) => ({ ...current, ...patch }));
  const num = (value: string) => (value === "" ? undefined : Number(value));

  if (!state) return null;

  return (
    <div className="space-y-10">
      {error && (
        <p className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="label">What fits you</h2>
          <p className="text-xs text-room-faint">
            Used on every search, every judgement, and every standing scan.
          </p>
        </div>

        <div className="panel space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="label block">Tops</span>
              <select
                value={draft.tops ?? ""}
                onChange={(e) => set({ tops: e.target.value || undefined })}
                className="field w-full"
              >
                <option value="">—</option>
                {LETTER_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="label block">Jacket chest</span>
              <input
                value={draft.jacket ?? ""}
                onChange={(e) => set({ jacket: e.target.value || undefined })}
                placeholder="42R"
                className="field w-full"
              />
            </label>

            <label className="space-y-1.5">
              <span className="label block">Shoe (US)</span>
              <input
                type="number"
                step="0.5"
                min={5}
                max={16}
                value={draft.shoe ?? ""}
                onChange={(e) => set({ shoe: num(e.target.value) })}
                placeholder="10"
                className="field w-full"
              />
            </label>

            <label className="space-y-1.5">
              <span className="label block">Waist</span>
              <input
                type="number"
                min={26}
                max={50}
                value={draft.waist ?? ""}
                onChange={(e) => set({ waist: num(e.target.value) })}
                placeholder="34"
                className="field w-full"
              />
            </label>

            <label className="space-y-1.5">
              <span className="label block">Inseam</span>
              <input
                type="number"
                min={26}
                max={40}
                value={draft.inseam ?? ""}
                onChange={(e) => set({ inseam: num(e.target.value) })}
                placeholder="32"
                className="field w-full"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={saveSizes} className="btn-primary">
              Save measurements
            </button>
            {saved && <span className="text-xs text-accent">Saved.</span>}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="label">How a brand runs</h2>
          <p className="text-xs text-room-faint">Reads the brand&rsquo;s size guide and what buyers report.</p>
        </div>

        {!state.configured ? (
          <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
            Brand sizing isn&rsquo;t configured on this deployment &mdash; it needs a search key. Your
            measurements above still work everywhere else.
          </p>
        ) : (
          <form onSubmit={check} className="panel flex flex-wrap items-end gap-3 px-6 py-5">
            <label className="space-y-1.5">
              <span className="label block">Brand</span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Barbour"
                maxLength={40}
                className="field w-48"
              />
            </label>
            <label className="space-y-1.5">
              <span className="label block">Garment</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="field w-40"
              >
                {GARMENTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy || !brand.trim() || !state.hasSizes} className="btn-primary">
              {busy ? "Reading…" : "Check"}
            </button>
            {!state.hasSizes && (
              <p className="w-full text-xs text-room-faint">
                Save at least one measurement above first &mdash; there&rsquo;s nothing to compare
                against otherwise.
              </p>
            )}
          </form>
        )}
      </section>

      {state.history.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">Brands you&rsquo;ve checked</h2>
          <ul className="space-y-3">
            {state.history.map((record) => (
              <li key={`${record.brand}-${record.category}`} className="panel px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-xl text-room-ink">
                      {record.brand} <span className="text-room-faint">·</span> {record.category}
                    </p>
                    <p className="mt-1 text-sm text-room-muted">
                      Buy <strong className="text-room-ink">{record.advice.recommendation}</strong> ·{" "}
                      {RUNS_COPY[record.advice.runs]} · {CONFIDENCE_COPY[record.advice.confidence]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => forget(record)}
                    aria-label={`Forget ${record.brand} ${record.category}`}
                    className="shrink-0 text-xs text-room-faint hover:text-room-ink"
                  >
                    Forget
                  </button>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-room-muted">{record.advice.reasoning}</p>

                {record.advice.cautions.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {record.advice.cautions.map((caution) => (
                      <li key={caution} className="text-xs text-room-muted">
                        &mdash; {caution}
                      </li>
                    ))}
                  </ul>
                )}

                {record.advice.sources.length > 0 && (
                  <p className="mt-3 text-xs text-room-faint">
                    Read: {record.advice.sources.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
