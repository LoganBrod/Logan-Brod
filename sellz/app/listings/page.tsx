"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScoreBar from "@/components/ScoreBar";
import Reveal from "@/components/Reveal";
import PageHeader from "@/components/PageHeader";
import ListingPreview from "@/components/ListingPreview";
import FixPanel from "@/components/FixPanel";
import MarketplacePanel from "@/components/MarketplacePanel";
import DepopCard from "@/components/DepopCard";
import type { MarketplaceState } from "@/lib/store";
import { MARKETPLACES, MARKETPLACE_IDS, type MarketplaceId } from "@/lib/marketplaces";
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
    updatedAt?: string;
  };
  /** Superseded by `marketplaces`; still present on older rows. */
  depop?: MarketplaceState;
  /** Per-marketplace drafts + manual tracking. None of them have an API. */
  marketplaces?: Record<string, MarketplaceState>;
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
  shipping?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: string;
    syncedToEbay: boolean;
    labelUrl?: string;
    labelCost?: number;
    shipmentId?: string;
  };
  packageWeightOz?: number;
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
  createdAt: string;
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
    <h3 className="text-sm font-semibold text-fog/60">
      {children}
    </h3>
  );
}

type QuickFilter = "all" | "attention" | "ready" | "missingCost";

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return Math.round((Date.now() - t) / 86400000);
}

/** Stale-and-neglected: live a long time with nothing done about it lately. */
function needsAttention(l: Listing): boolean {
  if (l.status === "stale") return true;
  if (l.status !== "active") return false;
  const since = daysSince(l.lastRelistedAt ?? l.outcome?.listedAt);
  return since !== null && since >= 60;
}

/** Sold, but no tracking recorded yet — the pile that still needs a trip to the post office. */
function needsShipping(l: Listing): boolean {
  return l.status === "sold" && !l.shipping?.trackingNumber;
}

type ViewMode = "cards" | "table";

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fog/60">
            {listings ? `${listings.length} listing${listings.length === 1 ? "" : "s"}` : "Listings"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {listings && listings.length > 0 && (
              <QuickFilters listings={listings} value={quickFilter} onChange={setQuickFilter} />
            )}
            <div className="flex gap-1 rounded-lg border border-ink-border bg-ink p-0.5">
              {(["cards", "table"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition " +
                    (viewMode === m ? "bg-brand text-ink" : "text-fog/50 hover:text-fog")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
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
          (() => {
            const filtered = [...listings]
              .filter((l) => {
                if (quickFilter === "attention") return needsAttention(l);
                if (quickFilter === "ready") return needsShipping(l);
                if (quickFilter === "missingCost") return l.cost?.purchasePrice === undefined;
                return true;
              })
              .sort((a, b) => (b.brainScore?.score ?? -1) - (a.brainScore?.score ?? -1));

            if (filtered.length === 0) return <p className="text-sm text-fog/40">Nothing matches this filter.</p>;

            // Depop gives us no dashboard to embed, so this grid is the only
            // place a seller sees their Depop shop outside the Depop app.
            // Drawn Depop-style because an eBay-style row reads as a note they
            // typed rather than something that is live somewhere.
            const depopListings = filtered.filter((l) => l.platform === "depop");

            return (
              <>
                {depopListings.length > 0 && (
                  <section className="mb-6">
                    <h3 className="mb-3 text-sm font-bold text-fog">Your Depop shop</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {depopListings.map((l) => (
                        <DepopCard
                          key={l.id}
                          title={l.title}
                          price={l.price}
                          photos={l.photos}
                          imageUrls={l.imageUrls}
                          status={l.status}
                          likes={l.outcome?.watchers}
                          views={l.outcome?.views}
                          soldPrice={l.outcome?.soldPrice}
                          onClick={() =>
                            document
                              .getElementById(`listing-${l.id}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}
                <BulkActionBar
                  listings={filtered}
                  selected={selected}
                  onClear={() => setSelected(new Set())}
                  onChanged={load}
                />
                {viewMode === "table" ? (
                  <ListingsTable
                    listings={filtered}
                    selected={selected}
                    onToggle={toggleSelect}
                    onSelectAll={(ids) => setSelected(new Set(ids))}
                    onChanged={load}
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filtered.map((l, i) => (
                      <Reveal key={l.id} index={i}>
                        {/* Anchor for the Depop grid above to scroll to. */}
                        <div id={`listing-${l.id}`}>
                        <ListingCard
                          listing={l}
                          onChanged={load}
                          selected={selected.has(l.id)}
                          onToggleSelect={() => toggleSelect(l.id)}
                        />
                        </div>
                      </Reveal>
                    ))}
                  </div>
                )}
              </>
            );
          })()
        )}
      </section>
    </div>
  );
}

/**
 * One-tap filters for the piles that matter once a shop has more than a
 * handful of listings: the ones going stale, the ones waiting to ship, and
 * the ones with no cost basis so profit can't be computed yet.
 */
function QuickFilters({
  listings,
  value,
  onChange,
}: {
  listings: Listing[];
  value: QuickFilter;
  onChange: (f: QuickFilter) => void;
}) {
  const counts = {
    all: listings.length,
    attention: listings.filter(needsAttention).length,
    ready: listings.filter(needsShipping).length,
    missingCost: listings.filter((l) => l.cost?.purchasePrice === undefined).length,
  };
  const chips: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "attention", label: "Needs attention" },
    { key: "ready", label: "Ready to ship" },
    { key: "missingCost", label: "Missing cost" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onChange(c.key)}
          className={
            "rounded-full border px-3 py-1 text-xs font-semibold transition " +
            (value === c.key
              ? "border-brand bg-brand/15 text-brand-dim"
              : "border-ink-border text-fog/50 hover:border-brand/40 hover:text-fog")
          }
        >
          {c.label}
          {c.key !== "all" && <span className="ml-1 text-fog/30">{counts[c.key]}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact rows for a shop with more than a handful of listings — a card per
 * item stops being scannable well before 200 does. Deliberately terse: the
 * card view is still where the detail tabs (comps, outcome, cost, diagnosis)
 * live, this is a bird's-eye pass to select and triage.
 */
function ListingsTable({
  listings,
  selected,
  onToggle,
  onSelectAll,
  onChanged,
}: {
  listings: Listing[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onChanged: () => void;
}) {
  const allIds = listings.map((l) => l.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function setStatus(id: string, status: string) {
    fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then(onChanged);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-border bg-ink-card shadow-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-border text-xs font-semibold text-fog/55">
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onSelectAll(allSelected ? [] : allIds)}
                className="h-3.5 w-3.5 accent-brand"
              />
            </th>
            <th className="px-2 py-2">Title</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Price</th>
            <th className="px-2 py-2">Score</th>
            <th className="px-2 py-2">Age</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const since = daysSince(l.outcome?.listedAt ?? l.createdAt);
            return (
              <tr key={l.id} className="border-b border-ink-border/60 last:border-b-0 hover:bg-ink/40">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => onToggle(l.id)}
                    className="h-3.5 w-3.5 accent-brand"
                  />
                </td>
                <td className="max-w-[280px] truncate px-2 py-2 font-medium text-fog">{l.title}</td>
                <td className="px-2 py-2">
                  <select
                    value={l.status}
                    onChange={(e) => setStatus(l.id, e.target.value)}
                    className={`rounded border border-ink-border bg-ink px-1.5 py-0.5 text-xs ${STATUS_COLOR[l.status]}`}
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="sold">sold</option>
                    <option value="stale">stale</option>
                    <option value="ended">ended</option>
                  </select>
                </td>
                <td className="px-2 py-2 text-fog/70">
                  ${l.price}
                  {l.outcome?.soldPrice !== undefined && (
                    <span className="text-brand"> → ${l.outcome.soldPrice}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {l.brainScore ? (
                    <ScoreBar compact score={l.brainScore.score} reason={l.brainScore.reason} />
                  ) : (
                    <span className="text-fog/30">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-fog/50">
                  {since !== null ? `${since}d` : "—"}
                  {needsAttention(l) && <span className="ml-1 text-amber-400">●</span>}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => {
                      if (confirm("Delete this listing?")) {
                        fetch(`/api/listings/${l.id}`, { method: "DELETE" }).then(onChanged);
                      }
                    }}
                    className="text-xs text-fog/40 hover:text-red-400"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Acting on 30 stale listings one at a time is what makes a Brain feel like
 * homework. Select a pile, then reprice or apply what the Brain already
 * proposed for them in one shot.
 */
function BulkActionBar({
  listings,
  selected,
  onClear,
  onChanged,
}: {
  listings: Listing[];
  selected: Set<string>;
  onClear: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pct, setPct] = useState("-10");
  const [busy, setBusy] = useState<string | null>(null);

  if (selected.size === 0) return null;
  const selectedListings = listings.filter((l) => selected.has(l.id));

  async function repriceSelected() {
    const delta = Number(pct);
    if (!isFinite(delta) || delta === 0) return;
    setBusy("reprice");
    let applied = 0;
    for (const l of selectedListings) {
      const next = Math.max(0.01, Math.round(l.price * (1 + delta / 100) * 100) / 100);
      try {
        const res = await fetch(`/api/listings/${l.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price: next }),
        });
        if (res.ok) applied++;
      } catch {
        // One failure shouldn't stop the rest of the batch.
      }
    }
    toast.push(`Repriced ${applied} of ${selectedListings.length} listing${selectedListings.length === 1 ? "" : "s"}`);
    setBusy(null);
    onChanged();
    onClear();
  }

  async function applyBrainSuggestions() {
    setBusy("apply");
    try {
      const res = await fetch("/api/proposals", { cache: "no-store" });
      const data = await res.json();
      const ids = new Set(selectedListings.map((l) => l.id));
      const pending: { id: string }[] = (data.proposals ?? []).filter(
        (p: { listingId: string; status: string }) => p.status === "pending" && ids.has(p.listingId)
      );
      if (pending.length === 0) {
        toast.push("No pending Brain proposals for the selected listings");
        setBusy(null);
        return;
      }
      let applied = 0;
      for (const p of pending) {
        try {
          const r = await fetch(`/api/proposals/${p.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
          });
          if (r.ok) applied++;
        } catch {
          // Continue the batch even if one proposal fails to apply.
        }
      }
      toast.push(`Applied ${applied} of ${pending.length} proposal${pending.length === 1 ? "" : "s"}`);
      onChanged();
      onClear();
    } catch {
      toast.push("Couldn't load proposals", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm">
      <span className="font-semibold text-brand">{selected.size} selected</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="w-16 rounded-lg border border-ink-border bg-ink px-2 py-1 text-xs text-fog focus:border-brand focus:outline-none"
        />
        <span className="text-xs text-fog/40">%</span>
        <button
          onClick={repriceSelected}
          disabled={busy !== null}
          className="rounded-lg bg-ink-border px-3 py-1.5 text-xs font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
        >
          {busy === "reprice" ? "Repricing…" : "Reprice selected"}
        </button>
      </div>
      <button
        onClick={applyBrainSuggestions}
        disabled={busy !== null}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
      >
        {busy === "apply" ? "Applying…" : "Apply Brain suggestions"}
      </button>
      <button onClick={onClear} className="ml-auto text-xs font-semibold text-fog/40 hover:text-fog">
        Clear selection
      </button>
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
          <span className="text-sm font-semibold text-fog/60">
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
                    <span className="block text-xs font-medium text-fog/55">{label}</span>
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

const SHIPPING_CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "OnTrac", "Other"] as const;

interface ShippingRate {
  rateId: string;
  carrier: string;
  service: string;
  cost: number;
  currency: string;
  deliveryEstimate?: string;
}

/**
 * Buys real postage through eBay. Every step is deliberately explicit: rates
 * are only fetched when asked for, nothing is preselected, and the actual
 * purchase needs a second confirmation naming the price — because unlike
 * everything else in this app, getting this wrong spends the seller's money
 * and can't be undone with an "undo" button.
 */
function BuyLabelBox({ listing: l, onChanged }: { listing: Listing; onChanged: () => void }) {
  const toast = useToast();
  const [canBuy, setCanBuy] = useState<boolean | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [chosen, setChosen] = useState<ShippingRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ebay/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => setCanBuy(Boolean(s.connected && s.canBuyLabels)))
      .catch(() => setCanBuy(false));
  }, []);

  async function loadRates() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${l.id}/label`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't get rates");
      setQuoteId(data.shippingQuoteId);
      setRates(data.rates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get rates");
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    if (!chosen || !quoteId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${l.id}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingQuoteId: quoteId, rateId: chosen.rateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't buy the label");
      toast.push(
        data.syncedToEbay
          ? `Label bought — tracking sent to eBay`
          : `Label bought, but tracking didn't reach eBay — mark shipped manually`
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't buy the label");
    } finally {
      setBusy(false);
      setChosen(null);
    }
  }

  if (canBuy === null) return null;

  if (!canBuy) {
    return (
      <div className="mt-2 rounded-lg border border-ink-border bg-ink-card p-3 text-xs">
        <p className="text-fog/60">
          Buy postage here at eBay&apos;s rates and the tracking fills itself in.
        </p>
        <a
          href="/api/ebay/connect?labels=1"
          className="mt-2 inline-block rounded bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink"
        >
          Enable label buying →
        </a>
        <p className="mt-1.5 text-fog/30">
          Re-authorises with shipping permissions. eBay grants label access per account, so this
          may not be available on yours — your current connection keeps working either way.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-border bg-ink-card p-3 text-xs">
      {error && <p className="mb-2 text-red-400">{error}</p>}

      {!rates && (
        <button
          onClick={loadRates}
          disabled={busy}
          className="rounded bg-ink-border px-3 py-1.5 font-semibold text-fog transition hover:bg-brand hover:text-ink disabled:opacity-50"
        >
          {busy ? "Checking rates…" : "Check postage rates"}
        </button>
      )}

      {rates && rates.length === 0 && (
        <p className="text-fog/50">eBay returned no postage rates for this parcel.</p>
      )}

      {rates && rates.length > 0 && !chosen && (
        <div className="space-y-1.5">
          <p className="text-fog/50">Pick a service — nothing is bought until you confirm.</p>
          {rates.map((r) => (
            <button
              key={r.rateId}
              onClick={() => setChosen(r)}
              className="flex w-full items-center justify-between gap-2 rounded border border-ink-border px-2.5 py-1.5 text-left transition hover:border-brand/50"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-fog">
                  {r.carrier} {r.service.replace(/_/g, " ")}
                </span>
                {r.deliveryEstimate && (
                  <span className="block text-fog/40">{r.deliveryEstimate}</span>
                )}
              </span>
              <span className="shrink-0 font-bold text-brand">${r.cost.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="rounded border border-brand/40 bg-brand/5 p-2.5">
          <p className="font-bold text-fog">
            Buy {chosen.carrier} {chosen.service.replace(/_/g, " ")} for ${chosen.cost.toFixed(2)}?
          </p>
          <p className="mt-1 text-fog/60">
            eBay charges this to your seller account immediately and the label can&apos;t be
            unbought from here. The tracking gets sent to the buyer automatically.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={buy}
              disabled={busy}
              className="rounded bg-brand px-3 py-1.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
            >
              {busy ? "Buying…" : `Yes, buy for $${chosen.cost.toFixed(2)}`}
            </button>
            <button
              onClick={() => setChosen(null)}
              disabled={busy}
              className="rounded bg-ink-border px-3 py-1.5 font-semibold text-fog"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Records real carrier + tracking for a sold item. When the listing is
 * linked to eBay, this also pushes the tracking to eBay itself — the seller
 * sees "shipped" here, but the buyer needs to see it there too, or nothing
 * has actually closed.
 */
function ShippingBox({ listing: l, onChanged }: { listing: Listing; onChanged: () => void }) {
  const toast = useToast();
  const [carrier, setCarrier] = useState<(typeof SHIPPING_CARRIERS)[number]>("USPS");
  const [tracking, setTracking] = useState(l.shipping?.trackingNumber ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!tracking.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${l.id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier, trackingNumber: tracking.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't record shipping");
      toast.push(
        data.syncedToEbay
          ? "Marked shipped — tracking pushed to eBay"
          : l.ebayItemId
            ? `Saved here, but couldn't push to eBay: ${data.ebayError ?? "unknown error"}`
            : "Saved — not linked to an eBay listing, so nothing to push"
      );
      onChanged();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Couldn't record shipping", "error");
    } finally {
      setBusy(false);
    }
  }

  if (l.shipping?.trackingNumber) {
    return (
      <div className="mt-3 border-t border-ink-border pt-3 text-xs">
        <SectionLabel>Shipping</SectionLabel>
        <p className="mt-1 text-fog/70">
          {l.shipping.carrier} · {l.shipping.trackingNumber}
          {l.shipping.syncedToEbay ? (
            <span className="text-brand"> · synced to eBay</span>
          ) : (
            <span className="text-amber-400"> · not synced to eBay</span>
          )}
        </p>
        <p className="mt-0.5 text-fog/30">
          Shipped {new Date(l.shipping.shippedAt).toLocaleDateString()}
          {l.shipping.labelCost !== undefined && ` · label $${l.shipping.labelCost.toFixed(2)}`}
        </p>
        {l.shipping.labelUrl && (
          <a
            href={l.shipping.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block rounded bg-brand px-2 py-1 font-bold text-ink transition hover:bg-brand-dim"
          >
            Download label (PDF)
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-ink-border pt-3">
      <SectionLabel>Shipping</SectionLabel>
      <BuyLabelBox listing={l} onChanged={onChanged} />
      <p className="mt-3 text-xs font-medium text-fog/50">
        Or record tracking you bought elsewhere
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-0.5">
          <span className="block text-xs font-medium text-fog/55">Carrier</span>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value as (typeof SHIPPING_CARRIERS)[number])}
            className="rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
          >
            {SHIPPING_CARRIERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-xs font-medium text-fog/55">Tracking number</span>
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="e.g. 9400111206213..."
            className="w-full rounded-lg border border-ink-border bg-ink-card px-2 py-1 text-fog focus:border-brand focus:outline-none"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !tracking.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
        >
          {busy ? "Saving…" : "Mark shipped"}
        </button>
      </div>
    </div>
  );
}

type TabKey = "listing" | MarketplaceId | "comps" | "outcome" | "cost" | "diagnosis";

function ListingCard({
  listing: l,
  onChanged,
  selected,
  onToggleSelect,
}: {
  listing: Listing;
  onChanged: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
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
    // Each marketplace is a separately written draft rather than a view of the
    // eBay one, so each earns its own tab instead of sitting under Listing.
    ...MARKETPLACE_IDS.map((m) => ({
      key: m as TabKey,
      label: MARKETPLACES[m].name,
      dot: !!(l.marketplaces?.[m]?.draft ?? (m === "depop" ? l.depop?.draft : undefined)),
    })),
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
        <span className="flex min-w-0 items-center gap-2">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 shrink-0 accent-brand"
            />
          )}
          <span className="min-w-0 truncate font-semibold text-fog">{l.title}</span>
        </span>
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

          {MARKETPLACE_IDS.map(
            (m) =>
              tab === m && (
                <MarketplacePanel
                  key={m}
                  listingId={l.id}
                  ebayPrice={l.price}
                  spec={MARKETPLACES[m]}
                  state={l.marketplaces?.[m] ?? (m === "depop" ? l.depop : undefined)}
                  outcome={l.outcome}
                  status={l.status}
                  onChanged={onChanged}
                />
              )
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
                    <span className="block text-xs font-medium text-fog/55">
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
                    <span className="block text-xs font-medium text-fog/55">{label}</span>
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
              {l.status === "sold" && <ShippingBox listing={l} onChanged={onChanged} />}
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
                    <span className="block text-xs font-medium text-fog/55">
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
              <h3 className="text-sm font-semibold text-amber-400">
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
