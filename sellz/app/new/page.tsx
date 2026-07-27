"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Analysis {
  identified: string;
  brand: string;
  size: string;
  visibleFlaws: string;
  confidence: number;
  uncertainties: string;
}

interface CompItem {
  title: string;
  price: number;
  sold: boolean;
  sellerFeedbackPct?: number;
  url?: string;
}

interface CompsSummary {
  note: string;
  soldDataAvailable: boolean;
  suggestedPrice?: number;
  priceLow?: number;
  priceHigh?: number;
  top: CompItem[];
}

interface Draft {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  tags: string[];
  photos?: string[];
}

interface Slot {
  label: string;
  id: string | null;
  preview: string | null;
  uploading: boolean;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

export default function NewListingPage() {
  const toast = useToast();
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([
    { label: "Front", id: null, preview: null, uploading: false },
    { label: "Back", id: null, preview: null, uploading: false },
  ]);
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comps, setComps] = useState<CompsSummary | null>(null);

  const photoIds = slots.map((s) => s.id).filter((v): v is string => Boolean(v));

  async function upload(index: number, file: File) {
    setSlots((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, uploading: true, preview: URL.createObjectURL(file) } : s
      )
    );
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, id: data.id, uploading: false } : s))
      );
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Upload failed", "error");
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, uploading: false, preview: null } : s))
      );
    }
  }

  function addSlot() {
    setSlots((prev) => [
      ...prev,
      { label: `Extra ${prev.length - 1}`, id: null, preview: null, uploading: false },
    ]);
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setDraft(data.listing);
      setAnalysis(data.analysis);
      setComps(data.comps);
      toast.push("Draft ready — review it before listing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  if (draft) {
    return (
      <ReviewStep
        draft={draft}
        setDraft={setDraft}
        analysis={analysis}
        comps={comps}
        onDone={() => router.push("/listings")}
        onRestart={() => {
          setDraft(null);
          setAnalysis(null);
          setComps(null);
          setSlots([
            { label: "Front", id: null, preview: null, uploading: false },
            { label: "Back", id: null, preview: null, uploading: false },
          ]);
          setNotes("");
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New listing"
        subtitle="Photograph the item — front and back — and the Brain writes the whole listing."
      />

      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          {slots.map((slot, i) => (
            <PhotoSlot key={i} slot={slot} onFile={(f) => upload(i, f)} />
          ))}
        </div>
        <button
          onClick={addSlot}
          className="mt-3 text-xs font-semibold text-brand hover:underline"
        >
          + Add another angle
        </button>

        <label className="mt-5 block space-y-1 text-sm">
          <span className="text-fog/50">
            Anything the photos don&apos;t show{" "}
            <span className="text-fog/30">(optional — measurements, flaws, history)</span>
          </span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. pit to pit 22in, small mark inside collar, smoke-free home"
            className={field}
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={analyze}
          disabled={analyzing || photoIds.length === 0}
          className="mt-5 w-full rounded-xl bg-brand py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              Identifying, pricing against comps…
            </span>
          ) : photoIds.length === 0 ? (
            "Add a photo to start"
          ) : (
            `Analyze ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} & write listing`
          )}
        </motion.button>
      </section>
    </div>
  );
}

function PhotoSlot({ slot, onFile }: { slot: Slot; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-fog/40">
        {slot.label}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-border bg-ink transition hover:border-brand/50"
      >
        {slot.preview ? (
          // object-contain, not cover: phone photos are usually portrait and
          // cover would crop the top and bottom of the item off.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.preview}
            alt={slot.label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-fog/40">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <circle cx="12" cy="13" r="3.5" />
              <path d="M8 6l1.5-2h5L16 6" />
            </svg>
            <span className="text-xs font-semibold">Take / choose photo</span>
          </span>
        )}
        {slot.uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/70">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          </span>
        )}
        {slot.id && !slot.uploading && (
          <span className="absolute bottom-2 right-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-ink">
            ✓
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function ReviewStep({
  draft,
  setDraft,
  analysis,
  comps,
  onDone,
  onRestart,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  analysis: Analysis | null;
  comps: CompsSummary | null;
  onDone: () => void;
  onRestart: () => void;
}) {
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/ebay/readiness")
      .then((r) => r.json())
      .then(setReadiness)
      .catch(() => {});
  }, []);

  async function saveEdits() {
    setSaving(true);
    await fetch(`/api/listings/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        price: draft.price,
        condition: draft.condition,
      }),
    });
    setSaving(false);
    toast.push("Draft saved");
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await saveEdits();
      const res = await fetch(`/api/listings/${draft.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publishing failed");
      toast.push("Listed on eBay");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setPublishing(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Review before listing" subtitle="Everything here is editable." />

      {analysis && (
        <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-fog">{analysis.identified}</h2>
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-bold " +
                (analysis.confidence >= 70
                  ? "bg-brand/15 text-brand"
                  : analysis.confidence >= 40
                    ? "bg-amber-400/15 text-amber-400"
                    : "bg-red-500/15 text-red-400")
              }
            >
              {analysis.confidence}% confident
            </span>
          </div>
          {analysis.visibleFlaws && (
            <p className="mt-2 text-sm text-fog/70">
              <span className="font-semibold text-fog/50">Flaws seen: </span>
              {analysis.visibleFlaws}
            </p>
          )}
          {analysis.uncertainties && (
            <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
              Couldn&apos;t tell from the photos: {analysis.uncertainties}
            </p>
          )}
        </section>
      )}

      {comps && (
        <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
            What comparable items go for
          </h2>
          <p className="mt-1 text-sm text-fog/70">{comps.note}</p>
          {comps.priceLow !== undefined && (
            <p className="mt-1 font-semibold text-brand">
              ${comps.priceLow} – ${comps.priceHigh}
              {comps.suggestedPrice ? ` · median $${comps.suggestedPrice}` : ""}
            </p>
          )}
          {comps.top.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {comps.top.slice(0, 6).map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-fog/60">
                  <span
                    className={
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold " +
                      (c.sold ? "bg-brand/15 text-brand" : "bg-ink-border text-fog/50")
                    }
                  >
                    {c.sold ? "SOLD" : "ASK"}
                  </span>
                  <span className="shrink-0 font-semibold text-fog/80">${c.price}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.sellerFeedbackPct !== undefined && (
                    <span className="shrink-0 text-fog/30">{c.sellerFeedbackPct}%</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-fog/50">
              Title{" "}
              <span className={draft.title.length > 80 ? "text-red-400" : "text-fog/30"}>
                ({draft.title.length}/80)
              </span>
            </span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={field}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-fog/50">Price ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                className={field}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-fog/50">Condition</span>
              <input
                value={draft.condition}
                onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
                className={field}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-fog/50">Description</span>
            <textarea
              rows={8}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={field}
            />
          </label>
        </div>
      </section>

      {readiness && !readiness.ready && (
        <p className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
          eBay can&apos;t publish yet — missing: {readiness.missing.join(", ")}. Set these up in My
          eBay → Account → Business Policies, then come back.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <AnimatePresence mode="wait">
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-brand/40 bg-ink-card p-5 shadow-glow"
          >
            <p className="font-bold text-fog">
              List this on eBay for ${draft.price.toFixed(2)}?
            </p>
            <p className="mt-1 text-sm text-fog/60">
              This creates a real, buyable listing on your eBay account immediately. Buyers can
              purchase it at this price.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={publish}
                disabled={publishing}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                {publishing ? "Listing…" : "Yes, list it now"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={publishing}
                className="rounded-lg bg-ink-border px-5 py-2 text-sm font-semibold text-fog"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" className="flex flex-wrap gap-2">
            <button
              onClick={() => setConfirming(true)}
              disabled={readiness ? !readiness.ready : false}
              title={readiness && !readiness.ready ? readiness.missing.join(", ") : undefined}
              className="rounded-xl bg-brand px-6 py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
            >
              Approve &amp; list on eBay
            </button>
            <button
              onClick={saveEdits}
              disabled={saving}
              className="rounded-xl bg-ink-border px-5 py-3 font-semibold text-fog transition hover:bg-ink-border/70 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as draft"}
            </button>
            <button
              onClick={onRestart}
              className="rounded-xl px-4 py-3 font-semibold text-fog/40 hover:text-fog"
            >
              Start over
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
