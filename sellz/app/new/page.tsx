"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import StepRail, { type RailStep } from "@/components/StepRail";
import { useToast } from "@/components/Toast";
import { fetchJson } from "@/lib/fetchJson";

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
  visualMatchCount?: number;
  suggestedPrice?: number;
  priceLow?: number;
  priceHigh?: number;
  top: CompItem[];
}

interface RetailInfo {
  productName: string;
  retailPrice: number;
  retailPriceNote: string;
  releaseEra: string;
  desirability: string;
  sellingPoints: string[];
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
  packageWeightOz?: number;
}

interface ItemSpecificUI {
  name: string;
  value: string;
  source: string;
}

interface Slot {
  label: string;
  id: string | null;
  preview: string | null;
  uploading: boolean;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

/** The guided sequence: link the account, teach it, shoot it, list it. */
type Phase = "connect" | "teach" | "photos";

interface Setup {
  ebayConnected: boolean;
  ebayConfigured: boolean;
  seedCount: number;
  listingCount: number;
  taught: boolean;
}

export default function NewListingPage() {
  const toast = useToast();
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([
    { label: "Front", id: null, preview: null, uploading: false },
    { label: "Back", id: null, preview: null, uploading: false },
  ]);
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comps, setComps] = useState<CompsSummary | null>(null);
  const [retail, setRetail] = useState<RetailInfo | null>(null);
  const [specifics, setSpecifics] = useState<ItemSpecificUI[]>([]);

  // Where the seller is in the flow, and what they already have set up.
  const [phase, setPhase] = useState<Phase | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);

  /**
   * Work out the first step that still needs doing. Anything already
   * satisfied is skipped rather than shown as a hurdle, so a returning seller
   * lands straight on the camera.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [status, seeds, listings] = await Promise.all([
        fetch("/api/ebay/status", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({ connected: false, configured: false })),
        fetch("/api/seeds", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => []),
        fetch("/api/listings", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => []),
      ]);
      if (cancelled) return;

      const seedCount = Array.isArray(seeds) ? seeds.length : 0;
      const listingCount = Array.isArray(listings) ? listings.length : 0;
      // The Brain has something to go on once there are a few references or
      // a few of the seller's own listings to learn from.
      const taught = seedCount >= 3 || listingCount >= 3;
      const next: Setup = {
        ebayConnected: Boolean(status.connected),
        ebayConfigured: Boolean(status.configured),
        seedCount,
        listingCount,
        taught,
      };
      setSetup(next);
      setPhase(!next.ebayConnected ? "connect" : !taught ? "teach" : "photos");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  /**
   * The pipeline runs as four separate requests. Together they take minutes;
   * a serverless function is cut off after ~26s, so doing it in one call
   * failed outright. Each stage lands independently and updates the screen,
   * which also means the seller sees progress instead of one long spinner.
   */
  async function analyze() {
    setAnalyzing(true);
    setError(null);
    setStage("Identifying the item…");
    try {
      const first = await fetchJson<{
        listing: Draft;
        analysis: Analysis;
        itemSpecifics: ItemSpecificUI[];
        query: string;
        ebayConnected: boolean;
      }>("/api/analyze-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, notes }),
      });

      const id = first.listing.id;
      setDraft(first.listing);
      setAnalysis(first.analysis);
      setSpecifics(first.itemSpecifics ?? []);
      setAnalyzing(false);
      toast.push("Draft ready — refining it now");

      // Everything below is enrichment: failures leave a usable draft behind.
      let compsData: (CompsSummary & { compLines?: unknown[] }) | null = null;
      if (first.ebayConnected) {
        setStage("Checking comparable eBay sales…");
        compsData = await fetchJson<CompsSummary & { compLines?: unknown[] }>(
          `/api/listings/${id}/ebay-comps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: first.query }),
          }
        ).catch(() => null);
        if (compsData) setComps(compsData);
      }

      setStage("Looking up what it sold for new…");
      const retailData = await fetchJson<RetailInfo | null>(`/api/listings/${id}/retail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: first.query,
          compTitles: (compsData?.top ?? []).map((c) => c.title).slice(0, 8),
        }),
      }).catch(() => null);
      if (retailData) setRetail(retailData);

      if (compsData || retailData) {
        setStage("Refining the listing against what it found…");
        const refined = await fetchJson<{
          listing: Draft;
          refined: boolean;
          analysis?: Analysis;
          itemSpecifics?: ItemSpecificUI[];
        }>(`/api/listings/${id}/refine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes,
            compLines: compsData?.compLines ?? [],
            visualMatchCount: compsData?.visualMatchCount ?? 0,
            compsNote: compsData?.note ?? "",
            suggestedPrice: compsData?.suggestedPrice,
          }),
        }).catch(() => null);

        if (refined?.refined) {
          setDraft(refined.listing);
          if (refined.analysis) setAnalysis(refined.analysis);
          if (refined.itemSpecifics?.length) setSpecifics(refined.itemSpecifics);
          toast.push("Listing refined against comps");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
      setStage(null);
    }
  }

  const rail: RailStep[] = [
    { key: "connect", label: "Connect eBay", done: setup?.ebayConnected },
    { key: "teach", label: "Teach the Brain", done: setup ? setup.taught : false },
    { key: "photos", label: "Photos" },
    { key: "review", label: "Review & list" },
  ];

  // Held until the setup check lands, so the flow never flashes "connect eBay"
  // at someone who connected it weeks ago.
  if (!draft && (phase === null || setup === null)) {
    return (
      <div className="space-y-5">
        <PageHeader title="New listing" subtitle="Getting your setup…" />
        <div className="h-24 animate-pulse bg-ink-deep" />
      </div>
    );
  }

  if (draft) {
    return (
      <div className="space-y-5">
        <StepRail steps={rail} current="review" />
        <ReviewStep
        draft={draft}
        setDraft={setDraft}
        analysis={analysis}
        comps={comps}
        retail={retail}
        specifics={specifics}
        setSpecifics={setSpecifics}
        stage={stage}
        onDone={() => router.push("/listings")}
        onRestart={() => {
          setDraft(null);
          setAnalysis(null);
          setComps(null);
          setRetail(null);
          setSpecifics([]);
          setSlots([
            { label: "Front", id: null, preview: null, uploading: false },
            { label: "Back", id: null, preview: null, uploading: false },
          ]);
          setNotes("");
          setPhase("photos");
        }}
        />
      </div>
    );
  }

  if (phase === "connect") {
    return (
      <div className="space-y-5">
        <StepRail steps={rail} current="connect" onJump={(k) => setPhase(k as Phase)} />
        <ConnectStep
          connected={Boolean(setup?.ebayConnected)}
          configured={Boolean(setup?.ebayConfigured)}
          onNext={() => setPhase("teach")}
        />
      </div>
    );
  }

  if (phase === "teach") {
    return (
      <div className="space-y-5">
        <StepRail steps={rail} current="teach" onJump={(k) => setPhase(k as Phase)} />
        <TeachStep
          seedCount={setup?.seedCount ?? 0}
          listingCount={setup?.listingCount ?? 0}
          ebayConnected={Boolean(setup?.ebayConnected)}
          onSeeded={(n) =>
            setSetup((s) => (s ? { ...s, seedCount: n, taught: n >= 3 || s.listingCount >= 3 } : s))
          }
          onNext={() => setPhase("photos")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepRail steps={rail} current="photos" onJump={(k) => setPhase(k as Phase)} />
      <PageHeader
        title="Photograph the item"
        subtitle="Front and back is enough. The Brain writes the listing from what it can see."
      />

      {/* Capped width: the photo slots are square, so on a wide screen an
          unconstrained grid turns them into oversized empty boxes. */}
      <section className="max-w-3xl rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
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
            <span className="text-fog/30">(optional: measurements, flaws, history)</span>
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

/** Step 1. Nothing can be published anywhere until the account is linked. */
function ConnectStep({
  connected,
  configured,
  onNext,
}: {
  connected: boolean;
  configured: boolean;
  onNext: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Connect your eBay account"
        subtitle="So listings can publish, and so pricing can look at what really sold."
      />
      <section className="border border-ink-border bg-ink-card p-6">
        {connected ? (
          <>
            <p className="text-sm font-bold text-brand">eBay is connected</p>
            <p className="mt-1.5 text-sm text-fog/55">
              Your listings can publish straight from here.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-fog/70">
              Linking eBay lets LevoZ publish the finished listing, pull in the items
              you already have on the site, and price against real sales rather than
              guesswork.
            </p>
            {!configured && (
              <p className="mt-3 border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-500">
                The eBay app credentials aren&apos;t set on this deployment yet, so the
                connect button won&apos;t work. You can still build a draft listing and
                publish it later.
              </p>
            )}
            <a
              href="/api/ebay/connect"
              className="mt-5 inline-block bg-brand px-6 py-3 text-sm font-bold text-ink transition hover:bg-brand-dim"
            >
              Connect eBay
            </a>
          </>
        )}
        <div className="mt-5 border-t border-ink-border pt-4">
          <button
            onClick={onNext}
            className="text-xs font-semibold text-fog/50 transition hover:text-fog"
          >
            {connected ? "Next: teach the Brain →" : "Skip for now, I'll just draft →"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Step 2. A Brain with nothing to go on prices from general instinct. */
function TeachStep({
  seedCount,
  listingCount,
  ebayConnected,
  onSeeded,
  onNext,
}: {
  seedCount: number;
  listingCount: number;
  ebayConnected: boolean;
  onSeeded: (count: number) => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  async function feed() {
    setBusy(true);
    setReport(null);
    try {
      const data = await fetchJson<{
        added: number;
        failed: number;
        results: { ok: boolean; title?: string; error?: string }[];
        seeds: unknown[];
      }>("/api/seeds/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      onSeeded(Array.isArray(data.seeds) ? data.seeds.length : seedCount + data.added);
      setUrls("");
      const failures = data.results.filter((r) => !r.ok);
      setReport(
        `Added ${data.added} reference${data.added === 1 ? "" : "s"}.` +
          (failures.length ? ` ${failures.length} couldn't be read: ${failures[0].error}` : "")
      );
      toast.push(`Fed the Brain ${data.added} listing${data.added === 1 ? "" : "s"}`);
    } catch (err) {
      setReport(err instanceof Error ? err.message : "Couldn't read those links");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Teach the Brain what sells"
        subtitle="Paste links to listings that sold well. It reads each one and learns the pattern."
      />
      <section className="border border-ink-border bg-ink-card p-6">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="border border-ink-border px-2.5 py-1 text-fog/60">
            {seedCount} reference{seedCount === 1 ? "" : "s"}
          </span>
          <span className="border border-ink-border px-2.5 py-1 text-fog/60">
            {listingCount} of your listings
          </span>
        </div>

        <label className="mt-5 block space-y-1 text-sm">
          <span className="text-fog/50">
            eBay links, one per line{" "}
            <span className="text-fog/30">(sold listings teach it the most)</span>
          </span>
          <textarea
            rows={4}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"https://www.ebay.com/itm/123456789012\nhttps://www.ebay.com/itm/234567890123"}
            className={field}
          />
        </label>

        {!ebayConnected && (
          <p className="mt-3 text-xs text-amber-500">
            Links are looked up through eBay, so connect the account first to use this.
          </p>
        )}
        {report && <p className="mt-3 text-xs text-fog/60">{report}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={feed}
            disabled={busy || !urls.trim() || !ebayConnected}
            className="bg-brand px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
          >
            {busy ? "Reading listings…" : "Feed the Brain"}
          </button>
          <button
            onClick={onNext}
            className="text-xs font-semibold text-fog/50 transition hover:text-fog"
          >
            {seedCount >= 3 || listingCount >= 3
              ? "Next: photograph the item →"
              : "Skip for now →"}
          </button>
        </div>
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
          <span className="absolute bottom-2 right-2 bg-brand px-2 py-0.5 text-[10px] font-bold text-ink">
            ✓
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
  retail,
  specifics,
  setSpecifics,
  stage,
  onDone,
  onRestart,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  analysis: Analysis | null;
  comps: CompsSummary | null;
  retail: RetailInfo | null;
  specifics: ItemSpecificUI[];
  setSpecifics: (s: ItemSpecificUI[]) => void;
  stage: string | null;
  onDone: () => void;
  onRestart: () => void;
}) {
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    message?: string;
    reason?: string;
    missing?: string[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");

  useEffect(() => {
    fetchJson<{ ready: boolean; message?: string; reason?: string; missing?: string[] }>(
      "/api/ebay/readiness"
    )
      .then(setReadiness)
      .catch(() => {});
  }, []);

  // Show the saved default in the box rather than applying it invisibly at
  // publish time, so the seller can see and correct it for this item.
  useEffect(() => {
    if (draft.packageWeightOz != null) return;
    fetchJson<{ defaultPackageWeightOz?: number }>("/api/settings")
      .then((s) => {
        if (s.defaultPackageWeightOz) {
          setDraft({ ...draft, packageWeightOz: s.defaultPackageWeightOz });
        }
      })
      .catch(() => {});
    // Only ever prefills an empty box, so it must not re-run on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        packageWeightOz: draft.packageWeightOz,
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

  async function schedulePublish() {
    if (!scheduleTime) return;
    setPublishing(true);
    setError(null);
    try {
      await saveEdits();
      const isoTime = new Date(scheduleTime).toISOString();
      await fetch(`/api/listings/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledPublishAt: isoTime,
        }),
      });
      toast.push(`Scheduled for ${new Date(scheduleTime).toLocaleString()}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scheduling failed");
    } finally {
      setPublishing(false);
      setScheduling(false);
    }
  }

  const filledCount = specifics.length;
  const specSourceColor = (s: string) => {
    if (s === "tag" || s === "photo") return "bg-brand/15 text-brand";
    if (s === "seller") return "bg-blue-500/15 text-blue-400";
    return "bg-amber-400/15 text-amber-400";
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Review before listing" subtitle="Everything here is editable." />

      {stage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand"
        >
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          {stage}
        </motion.div>
      )}

      {analysis && (
        <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-fog">{analysis.identified}</h2>
            <span
              className={
                "px-2 py-0.5 text-xs font-bold " +
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

      {retail && (
        <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/45">
            Retail and demand
          </h2>
          <p className="mt-1 font-semibold text-fog">
            {retail.productName}
            {retail.releaseEra && <span className="text-fog/45"> · {retail.releaseEra}</span>}
          </p>
          <p className="mt-1 text-sm text-fog/60">
            {retail.retailPrice > 0 ? (
              <>
                <span className="font-semibold text-brand">${retail.retailPrice} new</span>{" "}
                <span className="text-fog/45">({retail.retailPriceNote})</span>
              </>
            ) : (
              retail.retailPriceNote
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fog/60">{retail.desirability}</p>
          {retail.sellingPoints.length > 0 && (
            <ul className="mt-3 space-y-1">
              {retail.sellingPoints.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-fog/60">
                  <span className="text-brand">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {comps && (
        <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              What comparable items go for
            </h2>
            {(comps.visualMatchCount ?? 0) > 0 && (
              <span className="bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand-dim">
                {comps.visualMatchCount} matched from your photo
              </span>
            )}
          </div>
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

      {/* Item Specifics Editor */}
      <section className="rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/45">
            Item Specifics
          </h2>
          <span className="text-xs font-semibold text-brand">
            {filledCount} filled
          </span>
        </div>
        <p className="mt-1 text-xs text-fog/40">
          eBay ranks listings with complete specifics dramatically higher in search.
          Fill in as many as possible.
        </p>
        <div className="mt-3 space-y-2">
          {specifics.map((spec, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={spec.name}
                onChange={(e) => {
                  const updated = [...specifics];
                  updated[i] = { ...spec, name: e.target.value };
                  setSpecifics(updated);
                }}
                placeholder="Aspect name"
                className={field + " max-w-[140px] text-xs"}
              />
              <input
                value={spec.value}
                onChange={(e) => {
                  const updated = [...specifics];
                  updated[i] = { ...spec, value: e.target.value };
                  setSpecifics(updated);
                }}
                placeholder="Value"
                className={field + " flex-1 text-xs"}
              />
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold " +
                  specSourceColor(spec.source)
                }
              >
                {spec.source}
              </span>
              <button
                onClick={() => setSpecifics(specifics.filter((_, j) => j !== i))}
                className="text-fog/30 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setSpecifics([...specifics, { name: "", value: "", source: "seller" }])
          }
          className="mt-2 text-xs font-semibold text-brand hover:underline"
        >
          + Add specific
        </button>
      </section>

      <section className="rounded-2xl border border-ink-border bg-ink-card p-5">
        <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-fog/40">
          Shipping weight
        </h3>
        <p className="mb-3 text-xs text-fog/50">
          Weigh it packed — item, mailer and padding together. eBay quotes the buyer&apos;s
          postage from this, and won&apos;t list without it. Round up if unsure.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.1"
            value={draft.packageWeightOz ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                packageWeightOz: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            placeholder="e.g. 3"
            className={field + " max-w-[120px]"}
          />
          <span className="text-sm text-fog/60">oz</span>
          {draft.packageWeightOz != null && draft.packageWeightOz > 0 && (
            <span className="text-xs text-fog/40">
              ≈ {(draft.packageWeightOz / 16).toFixed(2)} lb
            </span>
          )}
        </div>
      </section>

      {readiness && !readiness.ready && (
        <div className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
          <p>{readiness.message ?? "eBay cannot publish yet."}</p>
          {readiness.reason === "needs_reconnect" && (
            <Link href="/brain" className="mt-1 inline-block font-semibold underline">
              Go to the Brain page to reconnect &rarr;
            </Link>
          )}
        </div>
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
              title={readiness && !readiness.ready ? readiness.message : undefined}
              className="rounded-xl bg-brand px-6 py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
            >
              Approve &amp; list on eBay
            </button>
            <button
              onClick={() => setScheduling(!scheduling)}
              disabled={readiness ? !readiness.ready : false}
              className="rounded-xl border border-brand/30 px-5 py-3 font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-40"
            >
              Schedule for later
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

      {/* Schedule picker */}
      {scheduling && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-brand/30 bg-ink-card p-5 shadow-card"
        >
          <p className="font-bold text-fog">Schedule this listing</p>
          <p className="mt-1 text-sm text-fog/60">
            The listing will go live at your chosen time. Best times: Sunday 7-9pm, weekday evenings.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Tonight 8pm", hours: (() => { const d = new Date(); d.setHours(20,0,0,0); if (d <= new Date()) d.setDate(d.getDate()+1); return d; })() },
              { label: "Sunday 7pm", hours: (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(19,0,0,0); return d; })() },
              { label: "Tomorrow 10am", hours: (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(10,0,0,0); return d; })() },
            ].map(({ label, hours }) => (
              <button
                key={label}
                onClick={() => setScheduleTime(hours.toISOString().slice(0, 16))}
                className="rounded-lg border border-ink-border px-3 py-1.5 text-xs font-semibold text-fog/70 hover:border-brand/40 hover:text-brand transition"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className={field + " max-w-xs text-sm"}
            />
            <button
              onClick={schedulePublish}
              disabled={!scheduleTime || publishing}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
            >
              {publishing ? "Scheduling…" : "Schedule"}
            </button>
            <button
              onClick={() => setScheduling(false)}
              className="rounded-lg bg-ink-border px-4 py-2 text-sm font-semibold text-fog"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
