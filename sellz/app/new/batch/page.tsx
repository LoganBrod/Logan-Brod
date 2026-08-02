"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { fetchJson } from "@/lib/fetchJson";

interface BatchItem {
  id: string;
  frontId: string | null;
  backId: string | null;
  frontPreview: string | null;
  backPreview: string | null;
  status: "queued" | "analyzing" | "comps" | "retail" | "refining" | "done" | "error";
  listingId?: string;
  title?: string;
  price?: number;
  score?: number;
  error?: string;
  approved: boolean;
  publishStatus?: "idle" | "publishing" | "published" | "error";
  publishError?: string;
}

const STAGE_LABEL: Record<BatchItem["status"], string> = {
  queued: "Queued",
  analyzing: "Identifying…",
  comps: "Checking comps…",
  retail: "Retail research…",
  refining: "Refining…",
  done: "Ready",
  error: "Failed",
};

/** Runs `work` over `items` with at most `limit` running at once. */
async function runPooled<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await work(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * A reseller with a pile of items shouldn't have to run the one-at-a-time
 * flow on /new fifty separate times. This captures a stack of front/back
 * photo pairs first, then runs them all through the same analyze → comps →
 * retail → refine pipeline the single-item flow uses, just with bounded
 * concurrency, landing on a review table instead of fifty separate sessions.
 */
export default function BatchModePage() {
  const toast = useToast();
  const [front, setFront] = useState<{ id: string | null; preview: string | null; uploading: boolean }>({
    id: null,
    preview: null,
    uploading: false,
  });
  const [back, setBack] = useState<{ id: string | null; preview: string | null; uploading: boolean }>({
    id: null,
    preview: null,
    uploading: false,
  });
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function uploadTo(setSlot: typeof setFront, file: File) {
    setSlot({ id: null, preview: URL.createObjectURL(file), uploading: true });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setSlot((prev) => ({ ...prev, id: data.id, uploading: false }));
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Upload failed", "error");
      setSlot({ id: null, preview: null, uploading: false });
    }
  }

  function addToBatch() {
    if (!front.id) return;
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID().slice(0, 8),
        frontId: front.id,
        backId: back.id,
        frontPreview: front.preview,
        backPreview: back.preview,
        status: "queued",
        approved: true,
      },
    ]);
    setFront({ id: null, preview: null, uploading: false });
    setBack({ id: null, preview: null, uploading: false });
  }

  function patchItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function processItem(item: BatchItem) {
    const photoIds = [item.frontId, item.backId].filter((v): v is string => Boolean(v));
    try {
      patchItem(item.id, { status: "analyzing" });
      const first = await fetchJson<{
        listing: { id: string; title: string; price: number };
        query: string;
        ebayConnected: boolean;
      }>("/api/analyze-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, notes: "" }),
      });
      const id = first.listing.id;
      patchItem(item.id, {
        listingId: id,
        title: first.listing.title,
        price: first.listing.price,
      });

      type CompsData = {
        compLines?: unknown[];
        visualMatchCount?: number;
        note?: string;
        suggestedPrice?: number;
        top?: { title: string }[];
      };
      let compsData: CompsData | null = null;
      if (first.ebayConnected) {
        patchItem(item.id, { status: "comps" });
        compsData = await fetchJson<CompsData>(`/api/listings/${id}/ebay-comps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: first.query }),
        }).catch(() => null);
      }

      patchItem(item.id, { status: "retail" });
      await fetchJson(`/api/listings/${id}/retail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: first.query,
          compTitles: (compsData?.top ?? []).map((c) => c.title).slice(0, 8),
        }),
      }).catch(() => null);

      patchItem(item.id, { status: "refining" });
      const refined = await fetchJson<{
        listing: { title: string; price: number };
        score?: { score: number } | null;
      }>(`/api/listings/${id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "",
          compLines: compsData?.compLines ?? [],
          visualMatchCount: compsData?.visualMatchCount ?? 0,
          compsNote: compsData?.note ?? "",
          suggestedPrice: compsData?.suggestedPrice,
        }),
      }).catch(() => null);

      const finalTitle = refined?.listing.title ?? first.listing.title;
      const finalPrice = refined?.listing.price ?? first.listing.price;
      const score = refined?.score?.score;

      patchItem(item.id, {
        status: "done",
        title: finalTitle,
        price: finalPrice,
        score,
        // A weak draft still lands as a real listing — just unchecked, so a
        // batch of 50 doesn't silently list 6 bad ones along with 44 good ones.
        approved: score === undefined || score >= 60,
      });
    } catch (err) {
      patchItem(item.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  async function processAll() {
    setProcessing(true);
    const queued = items.filter((it) => it.status === "queued");
    await runPooled(queued, 3, processItem);
    setProcessing(false);
    toast.push("Batch processed — review below");
  }

  async function publishSelected() {
    setPublishing(true);
    const toPublish = items.filter((it) => it.approved && it.status === "done" && it.listingId);
    let published = 0;
    for (const it of toPublish) {
      patchItem(it.id, { publishStatus: "publishing" });
      try {
        const res = await fetch(`/api/listings/${it.listingId}/publish`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Publish failed");
        patchItem(it.id, { publishStatus: "published" });
        published++;
      } catch (err) {
        patchItem(it.id, {
          publishStatus: "error",
          publishError: err instanceof Error ? err.message : "Publish failed",
        });
      }
    }
    setPublishing(false);
    toast.push(`Published ${published} of ${toPublish.length} listing${toPublish.length === 1 ? "" : "s"}`);
  }

  const done = items.filter((it) => it.status === "done" || it.status === "error");
  const queuedCount = items.filter((it) => it.status === "queued").length;
  const showReview = items.length > 0 && done.length === items.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Batch mode"
          subtitle="Shoot a pile of items back to back, then process and review them all at once."
        />
        <Link href="/new" className="text-xs font-semibold text-fog/50 hover:text-fog">
          ← Back to single item
        </Link>
      </div>

      {!showReview && (
        <section className="max-w-2xl rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
          <p className="text-sm font-semibold text-fog/60">
            {queuedCount} item{queuedCount === 1 ? "" : "s"} queued
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <BatchSlot label="Front" slot={front} onFile={(f) => uploadTo(setFront, f)} />
            <BatchSlot label="Back (optional)" slot={back} onFile={(f) => uploadTo(setBack, f)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={addToBatch}
              disabled={!front.id}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
            >
              + Add to batch
            </button>
            {queuedCount > 0 && (
              <button
                onClick={processAll}
                disabled={processing}
                className="rounded-xl border border-brand/40 px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-brand/10 disabled:opacity-40"
              >
                {processing ? "Processing…" : `Process all (${queuedCount}) →`}
              </button>
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {items.map((it) => (
                <div key={it.id} className="relative aspect-square overflow-hidden rounded-lg bg-ink">
                  {it.frontPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.frontPreview} alt="" className="h-full w-full object-cover" />
                  )}
                  <span
                    className={
                      "absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center text-[9px] font-bold " +
                      (it.status === "done"
                        ? "bg-brand/80 text-ink"
                        : it.status === "error"
                          ? "bg-red-500/80 text-white"
                          : "bg-ink/80 text-fog/70")
                    }
                  >
                    {STAGE_LABEL[it.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showReview && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fog/60">
              {done.filter((d) => d.status === "done").length} of {items.length} processed
              successfully. Approved items are pre-checked based on Brain score — uncheck anything
              you'd rather fix by hand first.
            </p>
            <button
              onClick={publishSelected}
              disabled={publishing || items.every((it) => !it.approved)}
              className="shrink-0 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
            >
              {publishing
                ? "Publishing…"
                : `Publish ${items.filter((it) => it.approved).length} selected →`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink-border bg-ink-card shadow-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-border text-xs font-semibold text-fog/55">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-2 py-2">Photo</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {items.map((it) => (
                    <motion.tr
                      key={it.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-ink-border/60 last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        {it.status === "done" && (
                          <input
                            type="checkbox"
                            checked={it.approved}
                            onChange={() => patchItem(it.id, { approved: !it.approved })}
                            className="h-3.5 w-3.5 accent-brand"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {it.frontPreview && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.frontPreview}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        )}
                      </td>
                      <td className="max-w-[260px] truncate px-2 py-2 font-medium text-fog">
                        {it.title ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-fog/70">{it.price ? `$${it.price}` : "—"}</td>
                      <td className="px-2 py-2">
                        {it.score !== undefined ? (
                          <span
                            className={
                              "px-2 py-0.5 text-xs font-bold " +
                              (it.score >= 70
                                ? "bg-brand/15 text-brand"
                                : it.score >= 40
                                  ? "bg-ink-border text-fog/70"
                                  : "bg-red-500/15 text-red-400")
                            }
                          >
                            {it.score}
                          </span>
                        ) : (
                          <span className="text-fog/30">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {it.publishStatus === "published" ? (
                          <span className="font-bold text-brand">Published</span>
                        ) : it.publishStatus === "publishing" ? (
                          <span className="text-fog/50">Publishing…</span>
                        ) : it.publishStatus === "error" ? (
                          <span className="text-red-400" title={it.publishError}>
                            Failed
                          </span>
                        ) : it.status === "error" ? (
                          <span className="text-red-400" title={it.error}>
                            {it.error?.slice(0, 40) ?? "Failed"}
                          </span>
                        ) : (
                          <span className="text-fog/30">Draft saved</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-fog/40">
            Everything here is saved as a listing either way — unpublished or unchecked items sit
            as drafts on the{" "}
            <Link href="/listings" className="text-brand hover:underline">
              Listings page
            </Link>{" "}
            for individual review, scoring, and fixing.
          </p>
        </section>
      )}
    </div>
  );
}

function BatchSlot({
  label,
  slot,
  onFile,
}: {
  label: string;
  slot: { id: string | null; preview: string | null; uploading: boolean };
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-fog/60">{label}</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-border bg-ink transition hover:border-brand/50"
      >
        {slot.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.preview} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs font-semibold text-fog/40">Take / choose photo</span>
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
