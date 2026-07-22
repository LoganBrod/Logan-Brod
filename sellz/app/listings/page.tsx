"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScoreRing from "@/components/ScoreRing";
import Reveal from "@/components/Reveal";
import { CardSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

interface Listing {
  id: string;
  platform: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  tags: string[];
  photosNote: string;
  status: "draft" | "active" | "sold" | "stale" | "ended";
  source: "imported" | "generated";
  outcome?: {
    views: number;
    watchers: number;
    offers: number;
    soldPrice?: number;
    listedAt?: string;
    soldAt?: string;
  };
  comps?: {
    summary: string;
    priceLow?: number;
    priceHigh?: number;
    demandNotes: string;
    sources: string[];
    manualNotes?: string;
  };
  brainScore?: { score: number; reason: string };
  diagnosis?: {
    text: string;
    rewrittenTitle: string;
    rewrittenDescription: string;
    suggestedPrice: number;
    at: string;
  };
  experimentId?: string;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

const STATUS_COLOR: Record<string, string> = {
  sold: "text-brand",
  stale: "text-amber-400",
  draft: "text-fog/60",
  active: "text-fog",
  ended: "text-fog/40",
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/listings");
    if (res.ok) setListings(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = (listings ?? []).some((l) => l.source === "generated" && !l.brainScore);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [pending, load]);

  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-extrabold text-fog"
      >
        Listings
      </motion.h1>

      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <button
          onClick={() => setImportOpen(!importOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-xl font-extrabold text-fog">Import a listing</h2>
            <p className="text-sm text-fog/60">
              Feed the Brain your history — sold listings AND the ones that never
              moved. Both teach it.
            </p>
          </div>
          <span className="text-fog/40">{importOpen ? "▲" : "▼"}</span>
        </button>
        <AnimatePresence initial={false}>
          {importOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ImportForm onDone={() => load()} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          {listings ? `${listings.length} listing${listings.length === 1 ? "" : "s"}` : "Listings"}
        </h2>
        {!listings ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-fog/40">
            Nothing yet — import your history above, or generate listings from
            the Generate page.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...listings]
              .sort((a, b) => (b.brainScore?.score ?? -1) - (a.brainScore?.score ?? -1))
              .map((l, i) => (
                <Reveal key={l.id} index={i}>
                  <ListingCard listing={l} onChanged={load} />
                </Reveal>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: "",
    platform: "ebay",
    status: "active",
    price: "",
    category: "",
    condition: "",
    tags: "",
    description: "",
    photosNote: "",
    views: "",
    watchers: "",
    offers: "",
    soldPrice: "",
    listedAt: "",
    soldAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          outcome: {
            views: f.views,
            watchers: f.watchers,
            offers: f.offers,
            soldPrice: f.soldPrice,
            listedAt: f.listedAt,
            soldAt: f.soldAt,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setF({ ...f, title: "", description: "", price: "", views: "", watchers: "", offers: "", soldPrice: "" });
      toast.push("Listing imported");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Listing title" className={`${field} sm:col-span-2`} />
      <div className="grid grid-cols-3 gap-3">
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} className={field}>
          <option value="ebay">eBay</option>
          <option value="depop">Depop</option>
          <option value="other">Other</option>
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={field}>
          <option value="active">active</option>
          <option value="sold">sold</option>
          <option value="stale">stale (not selling)</option>
          <option value="ended">ended unsold</option>
        </select>
        <input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="Ask $" className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category" className={field} />
        <input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder="Condition" className={field} />
      </div>
      <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" className={`${field} sm:col-span-2`} />
      <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Tags, comma separated" className={field} />
      <input value={f.photosNote} onChange={(e) => setF({ ...f, photosNote: e.target.value })} placeholder="What the photos show" className={field} />
      <div className="grid grid-cols-6 gap-2 sm:col-span-2">
        {(
          [
            ["views", "views"],
            ["watchers", "watchers"],
            ["offers", "offers"],
            ["soldPrice", "sold $"],
            ["listedAt", "listed"],
            ["soldAt", "sold date"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="space-y-0.5">
            <span className="block text-[10px] uppercase tracking-wider text-fog/40">{label}</span>
            <input
              type={k === "listedAt" || k === "soldAt" ? "date" : "number"}
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
        disabled={busy || !f.title.trim()}
        className="rounded-lg bg-brand px-6 py-2 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50 sm:col-span-2"
      >
        {busy ? "Importing…" : "Import listing"}
      </button>
    </div>
  );
}

function ListingCard({ listing: l, onChanged }: { listing: Listing; onChanged: () => void }) {
  const toast = useToast();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualComps, setManualComps] = useState(l.comps?.manualNotes ?? "");
  const [o, setO] = useState({
    views: l.outcome?.views ?? 0,
    watchers: l.outcome?.watchers ?? 0,
    offers: l.outcome?.offers ?? 0,
    soldPrice: l.outcome?.soldPrice ?? "",
  });
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function act(key: string, url: string, init?: RequestInit, successMsg?: string) {
    setBusyAction(key);
    setActionError(null);
    try {
      const res = await fetch(url, init ?? { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      if (successMsg) toast.push(successMsg);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card transition-colors hover:border-brand/30"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-fog">{l.title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {l.brainScore && <ScoreRing score={l.brainScore.score} size={36} reason={l.brainScore.reason} />}
          <select
            value={l.status}
            onChange={(e) =>
              fetch(`/api/listings/${l.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: e.target.value }),
              }).then(onChanged)
            }
            className={`rounded-lg border border-ink-border bg-ink px-1.5 py-0.5 text-xs ${STATUS_COLOR[l.status]}`}
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="sold">sold</option>
            <option value="stale">stale</option>
            <option value="ended">ended</option>
          </select>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-fog/40">
        {l.platform} · ${l.price}
        {l.outcome?.soldPrice !== undefined && (
          <span className="text-brand"> → sold ${l.outcome.soldPrice}</span>
        )}
        {" · "}
        {l.source}
        {l.experimentId && l.experimentId !== "control" && " · 🧪 " + l.experimentId}
      </p>
      {l.brainScore && <p className="mt-1 text-xs text-fog/50">{l.brainScore.reason}</p>}

      <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
        <p className="whitespace-pre-wrap text-fog/80">{l.description}</p>
        {l.tags.length > 0 && (
          <p className="mt-1 text-xs text-fog/50">{l.tags.map((t) => `#${t}`).join(" ")}</p>
        )}
        {l.photosNote && (
          <p className="mt-1 text-xs text-fog/40">📷 {l.photosNote}</p>
        )}
        <button
          onClick={() => copy(`${l.title}\n\n${l.description}`, "copy")}
          className="mt-2 rounded bg-ink-border px-2 py-0.5 text-xs text-fog transition hover:bg-brand hover:text-ink"
        >
          {copied === "copy" ? "Copied!" : "Copy listing"}
        </button>
      </div>

      {/* Comps */}
      <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Comps
          </h3>
          <button
            onClick={() =>
              act("comps", `/api/listings/${l.id}/comps`, undefined, "Comps updated")
            }
            disabled={busyAction !== null}
            className="rounded bg-ink-border px-2 py-0.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
          >
            {busyAction === "comps" ? "Researching…" : l.comps?.summary ? "Re-research" : "Research comps"}
          </button>
        </div>
        {l.comps?.summary ? (
          <div className="mt-1 text-xs text-fog/70">
            <p>{l.comps.summary}</p>
            {l.comps.priceLow !== undefined && (
              <p className="mt-0.5 font-semibold text-brand">
                ${l.comps.priceLow} – ${l.comps.priceHigh}
              </p>
            )}
            <p className="mt-0.5 text-fog/50">{l.comps.demandNotes}</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-fog/40">
            Not researched yet — or paste your own below.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={manualComps}
            onChange={(e) => setManualComps(e.target.value)}
            placeholder="Paste comps you found (sold prices, links)"
            className={`${field} bg-ink-card text-xs`}
          />
          <button
            onClick={() =>
              act(
                "manual",
                `/api/listings/${l.id}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ manualComps }),
                },
                "Comps saved"
              )
            }
            className="shrink-0 rounded bg-ink-border px-2 py-0.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink"
          >
            Save
          </button>
        </div>
      </div>

      {/* Outcome */}
      <div className="mt-3 rounded-xl bg-ink p-3 text-sm">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          Outcome
        </h3>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          {(
            [
              ["views", "views"],
              ["watchers", "watchers"],
              ["offers", "offers"],
              ["soldPrice", "sold $"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="space-y-0.5">
              <span className="block text-[10px] uppercase tracking-wider text-fog/40">
                {label}
              </span>
              <input
                type="number"
                min={0}
                value={o[k]}
                onChange={(e) => setO({ ...o, [k]: e.target.value })}
                className="w-20 rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
              />
            </label>
          ))}
          <button
            onClick={() =>
              act(
                "outcome",
                `/api/listings/${l.id}/outcome`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(o),
                },
                "Outcome saved"
              )
            }
            className="rounded-lg bg-ink-border px-3 py-1.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink"
          >
            Save
          </button>
        </div>
      </div>

      {/* Diagnosis */}
      <AnimatePresence>
        {l.diagnosis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 overflow-hidden rounded-xl border border-amber-400/30 bg-ink p-3 text-sm"
          >
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
              Why it isn't selling
            </h3>
            <p className="mt-1 text-xs text-fog/80">{l.diagnosis.text}</p>
            <div className="mt-2 rounded-lg bg-ink-card p-2 text-xs">
              <p className="font-bold text-fog">{l.diagnosis.rewrittenTitle}</p>
              <p className="mt-1 whitespace-pre-wrap text-fog/70">
                {l.diagnosis.rewrittenDescription}
              </p>
              <p className="mt-1 font-semibold text-brand">
                Suggested price: ${l.diagnosis.suggestedPrice}
              </p>
              <button
                onClick={() =>
                  copy(
                    `${l.diagnosis!.rewrittenTitle}\n\n${l.diagnosis!.rewrittenDescription}`,
                    "rewrite"
                  )
                }
                className="mt-1 rounded bg-ink-border px-2 py-0.5 text-fog transition hover:bg-brand hover:text-ink"
              >
                {copied === "rewrite" ? "Copied!" : "Copy rewrite"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {actionError && <p className="mt-2 text-xs text-red-400">{actionError}</p>}

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button
          onClick={() => act("score", `/api/listings/${l.id}/score`, undefined, "Rescored")}
          disabled={busyAction !== null}
          className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
        >
          {busyAction === "score" ? "Scoring…" : l.brainScore ? "Rescore" : "Score"}
        </button>
        {l.status !== "sold" && (
          <button
            onClick={() => act("diagnose", `/api/listings/${l.id}/diagnose`)}
            disabled={busyAction !== null}
            className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
          >
            {busyAction === "diagnose" ? "Diagnosing…" : "Why isn't it selling?"}
          </button>
        )}
        <button
          onClick={() => {
            if (confirm("Delete this listing?"))
              act("delete", `/api/listings/${l.id}`, { method: "DELETE" }, "Deleted");
          }}
          className="ml-auto rounded-lg px-2 py-1.5 text-fog/40 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </motion.div>
  );
}
