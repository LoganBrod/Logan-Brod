"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScoreBar from "@/components/ScoreBar";
import Reveal from "@/components/Reveal";
import PageHeader from "@/components/PageHeader";
import ListingPreview from "@/components/ListingPreview";
import FixPanel from "@/components/FixPanel";
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
  ebayItemId?: string;
  /** Present only for listings published from here; required to relist. */
  ebayOfferId?: string;
  relistHistory?: { oldItemId: string; newItemId: string; oldPrice: number; newPrice: number; at: string }[];
  lastRelistedAt?: string;
  photos?: string[];
  /** eBay-hosted images on listings synced from the account */
  imageUrls?: string[];
  publishedAt?: string;
  cost?: {
    purchasePrice?: number;
    shippingCost?: number;
    fees?: number;
    source?: string;
  };
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/40">
      {children}
    </h3>
  );
}

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
      <PageHeader
        title="Listings"
        subtitle="Feed it sold and stuck listings, then grade, research comps, and diagnose what is not moving."
      />

      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <button
          onClick={() => setImportOpen(!importOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-extrabold text-fog">Import a listing</h2>
            <p className="text-sm text-fog/60">
              Sold listings and the ones that never moved. Both teach the Brain.
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
              <LinkImport onDone={() => load()} />
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
            Nothing yet. Import your history above, or generate listings from
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

/**
 * Import by pasting eBay links. Faster and more accurate than the form below,
 * which is kept for listings that aren't on eBay, or that are already gone.
 */
function LinkImport({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/listings/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const failures = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setReport(
        `${data.created} imported, ${data.updated} updated` +
          (failures.length ? ` — ${failures.length} couldn't be read: ${failures[0].error}` : "")
      );
      if (data.created || data.updated) {
        setUrls("");
        toast.push(`Imported ${data.created + data.updated} listing(s)`);
        onDone();
      }
    } catch (err) {
      setReport(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border border-ink-border bg-ink p-4">
      <SectionLabel>Paste eBay links</SectionLabel>
      <p className="mt-1.5 text-xs text-fog/50">
        One per line. Title, price, condition, photos and item specifics are read
        off each listing, so there is nothing to type.
      </p>
      <textarea
        rows={3}
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder={"https://www.ebay.com/itm/123456789012\nhttps://www.ebay.com/itm/234567890123"}
        className={field + " mt-2"}
      />
      {report && <p className="mt-2 text-xs text-fog/60">{report}</p>}
      <button
        onClick={submit}
        disabled={busy || !urls.trim()}
        className="mt-3 bg-brand px-5 py-2 text-xs font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
      >
        {busy ? "Reading listings…" : "Import from links"}
      </button>
    </div>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [outcomeOpen, setOutcomeOpen] = useState(false);
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
    <div className="mt-5 space-y-5 text-sm">
      <div className="space-y-3">
        <SectionLabel>Basics</SectionLabel>
        <input
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="Listing title"
          className={field}
        />
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
      </div>

      <div className="space-y-3">
        <SectionLabel>Details</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category" className={field} />
          <input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder="Condition" className={field} />
        </div>
        <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" className={field} />
        <div className="grid grid-cols-2 gap-3">
          <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Tags, comma separated" className={field} />
          <input value={f.photosNote} onChange={(e) => setF({ ...f, photosNote: e.target.value })} placeholder="What the photos show" className={field} />
        </div>
      </div>

      <div className="rounded-xl border border-ink-border/60 bg-ink/40 p-3">
        <button
          onClick={() => setOutcomeOpen(!outcomeOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-fog/40">
            Outcome data <span className="font-normal normal-case text-fog/30">· optional, add if you have it</span>
          </span>
          <span className="text-fog/40">{outcomeOpen ? "▲" : "▼"}</span>
        </button>
        <AnimatePresence initial={false}>
          {outcomeOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !f.title.trim()}
        className="w-full rounded-lg bg-brand px-6 py-2 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import listing"}
      </button>
    </div>
  );
}

type TabKey = "listing" | "comps" | "outcome" | "cost" | "diagnosis";

function ListingCard({ listing: l, onChanged }: { listing: Listing; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("listing");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualComps, setManualComps] = useState(l.comps?.manualNotes ?? "");
  const [ebayItemId, setEbayItemId] = useState(l.ebayItemId ?? "");
  const [cost, setCost] = useState({
    purchasePrice: l.cost?.purchasePrice ?? "",
    shippingCost: l.cost?.shippingCost ?? "",
    fees: l.cost?.fees ?? "",
    source: l.cost?.source ?? "",
  });
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
      if (key === "diagnose") setTab("diagnosis");
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyAction(null);
    }
  }

  const TABS: { key: TabKey; label: string; dot?: boolean }[] = [
    { key: "listing", label: "Listing" },
    { key: "comps", label: "Comps", dot: !!l.comps?.summary },
    { key: "outcome", label: "Outcome" },
    { key: "cost", label: "Cost", dot: l.cost?.purchasePrice !== undefined },
    ...(l.diagnosis ? [{ key: "diagnosis" as const, label: "Diagnosis", dot: true }] : []),
  ];

  const profit =
    l.status === "sold" && l.outcome?.soldPrice !== undefined && l.cost?.purchasePrice !== undefined
      ? l.outcome.soldPrice -
        (l.cost.purchasePrice + (l.cost.shippingCost ?? 0) + (l.cost.fees ?? 0))
      : null;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card transition-colors hover:border-brand/30"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-fog">{l.title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {l.brainScore && <ScoreBar compact score={l.brainScore.score} reason={l.brainScore.reason} />}
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

      <div className="mt-3 flex gap-1 rounded-lg border border-ink-border bg-ink p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "relative flex-1 rounded-md px-2 py-1.5 font-semibold transition-colors " +
              (tab === t.key ? "text-ink" : "text-fog/60 hover:text-fog")
            }
          >
            {tab === t.key && (
              <motion.span
                layoutId={`tab-pill-${l.id}`}
                className="absolute inset-0 rounded-md bg-brand"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">
              {t.label}
              {t.dot && tab !== t.key && (
                <span className="ml-1 inline-block h-1 w-1 rounded-full bg-brand align-middle" />
              )}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="mt-3"
        >
          {tab === "listing" && (
            <div>
              <ListingPreview l={l} />
              <button
                onClick={() => copy(`${l.title}\n\n${l.description}`, "copy")}
                className="mt-2 rounded bg-ink-border px-2 py-0.5 text-xs text-fog transition hover:bg-brand hover:text-ink"
              >
                {copied === "copy" ? "Copied!" : "Copy listing"}
              </button>
            </div>
          )}

          {tab === "comps" && (
            <div className="rounded-xl bg-ink p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Comps</SectionLabel>
                <button
                  onClick={() => act("comps", `/api/listings/${l.id}/comps`, undefined, "Comps updated")}
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
                <p className="mt-1 text-xs text-fog/40">Not researched yet. Paste your own below.</p>
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
          )}

          {tab === "outcome" && (
            <div className="rounded-xl bg-ink p-3 text-sm">
              <SectionLabel>Outcome</SectionLabel>
              {l.platform === "ebay" && (
                <div className="mt-2 flex flex-wrap items-end gap-2 border-b border-ink-border pb-3">
                  <label className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-[10px] uppercase tracking-wider text-fog/40">
                      eBay item ID
                    </span>
                    <input
                      value={ebayItemId}
                      onChange={(e) => setEbayItemId(e.target.value)}
                      placeholder="e.g. 123456789012"
                      className="w-full rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
                    />
                  </label>
                  <button
                    onClick={() =>
                      act(
                        "link-ebay",
                        `/api/listings/${l.id}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ebayItemId }),
                        },
                        "Linked to eBay listing"
                      )
                    }
                    disabled={busyAction !== null}
                    className="shrink-0 rounded-lg bg-ink-border px-3 py-1.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() =>
                      act("ebay-sync", `/api/listings/${l.id}/ebay-sync`, undefined, "Synced from eBay")
                    }
                    disabled={busyAction !== null || !l.ebayItemId}
                    title={!l.ebayItemId ? "Save an eBay item ID first" : undefined}
                    className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
                  >
                    {busyAction === "ebay-sync" ? "Syncing…" : "Sync from eBay"}
                  </button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {(
                  [
                    ["views", "views"],
                    ["watchers", "watchers"],
                    ["offers", "offers"],
                    ["soldPrice", "sold $"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="space-y-0.5">
                    <span className="block text-[10px] uppercase tracking-wider text-fog/40">{label}</span>
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
          )}

          {tab === "cost" && (
            <div className="rounded-xl bg-ink p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Cost basis</SectionLabel>
                {profit !== null && (
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-bold " +
                      (profit >= 0 ? "bg-brand/15 text-brand" : "bg-red-500/15 text-red-400")
                    }
                  >
                    {profit >= 0 ? "+" : "−"}${Math.abs(profit).toFixed(2)} profit
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["purchasePrice", "paid $"],
                    ["shippingCost", "shipping $"],
                    ["fees", "fees $"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="space-y-0.5">
                    <span className="block text-[10px] uppercase tracking-wider text-fog/40">
                      {label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={cost[k]}
                      onChange={(e) => setCost({ ...cost, [k]: e.target.value })}
                      className="w-full rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={cost.source}
                  onChange={(e) => setCost({ ...cost, source: e.target.value })}
                  placeholder="Where you sourced it (thrift, wholesale, estate sale…)"
                  className={`${field} bg-ink-card text-xs`}
                />
                <button
                  onClick={() =>
                    act(
                      "cost",
                      `/api/listings/${l.id}/cost`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(cost),
                      },
                      "Cost saved"
                    )
                  }
                  className="shrink-0 rounded bg-ink-border px-3 py-1 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-[11px] text-fog/30">
                Feeds the Analytics page: margins, best-performing categories, and which sources
                are worth repeating.
              </p>
            </div>
          )}

          {tab === "diagnosis" && l.diagnosis && (
            <div className="rounded-xl border border-amber-400/30 bg-ink p-3 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                Why it isn't selling
              </h3>
              <p className="mt-1 text-xs text-fog/80">{l.diagnosis.text}</p>
              <div className="mt-2 rounded-lg bg-ink-card p-2 text-xs">
                <p className="font-bold text-fog">{l.diagnosis.rewrittenTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-fog/70">{l.diagnosis.rewrittenDescription}</p>
                <p className="mt-1 font-semibold text-brand">
                  Suggested price: ${l.diagnosis.suggestedPrice}
                </p>
                <button
                  onClick={() =>
                    copy(`${l.diagnosis!.rewrittenTitle}\n\n${l.diagnosis!.rewrittenDescription}`, "rewrite")
                  }
                  className="mt-1 rounded bg-ink-border px-2 py-0.5 text-fog transition hover:bg-brand hover:text-ink"
                >
                  {copied === "rewrite" ? "Copied!" : "Copy rewrite"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* A weak grade is only useful if it comes with the repair. */}
      {l.brainScore && l.brainScore.score < 70 && l.status !== "sold" && (
        <FixPanel
          listingId={l.id}
          score={l.brainScore.score}
          canRelist={Boolean(l.ebayOfferId)}
          onApplied={onChanged}
        />
      )}

      {/* Proof the relist system actually did something: a real new item id
          and timestamp, not just a claim. Last entry first. */}
      {l.relistHistory && l.relistHistory.length > 0 && (
        <p className="mt-2 text-xs text-fog/40">
          Relisted {l.relistHistory.length}×, last{" "}
          {new Date(l.relistHistory[l.relistHistory.length - 1].at).toLocaleString()} — $
          {l.relistHistory[l.relistHistory.length - 1].oldPrice} → $
          {l.relistHistory[l.relistHistory.length - 1].newPrice}
        </p>
      )}

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
        {l.status === "active" && l.ebayOfferId && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Relist now? This ends the current listing and republishes it fresh — it loses its watchers and question history, and may cost an insertion fee."
                )
              ) {
                act(
                  "relist",
                  "/api/relist",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ listingId: l.id }),
                  },
                  "Relisted on eBay"
                );
              }
            }}
            disabled={busyAction !== null}
            className="rounded-lg bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
          >
            {busyAction === "relist" ? "Relisting…" : "Relist now"}
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
