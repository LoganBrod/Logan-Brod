"use client";

import { useCallback, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import PageHeader from "../components/PageHeader";
import StatPanel from "../components/StatPanel";
import Badge, { type BadgeTone } from "../components/Badge";
import Ticker from "../components/Ticker";
import type { ScanResult } from "../api/cards/scan/route";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function discountBadge(discountPct: number): { label: string; tone: BadgeTone } {
  if (discountPct >= 0.4) return { label: "Grail", tone: "gold" };
  if (discountPct >= 0.3) return { label: "Very Hot", tone: "positive" };
  if (discountPct >= 0.2) return { label: "Hot", tone: "positive" };
  return { label: "Deal", tone: "neutral" };
}

export default function CardsPage() {
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [categoryId, setCategoryId] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim(), threshold: String(threshold) });
        if (categoryId.trim()) params.set("categoryId", categoryId.trim());
        const res = await fetch(`/api/cards/scan?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setResult(json as ScanResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to scan");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [query, threshold, categoryId]
  );

  const tickerItems = useMemo(() => {
    if (!result || result.deals.length === 0) {
      return [
        { label: "TRY", value: '"2018 PANINI PRIZM LUKA DONCIC PSA 10"', tone: "neutral" as const },
        { label: "TRY", value: '"2003 TOPPS CHROME LEBRON JAMES"', tone: "neutral" as const },
      ];
    }
    return result.deals.slice(0, 8).map((d) => ({
      label: d.title.length > 40 ? `${d.title.slice(0, 40)}…` : d.title,
      value: `-${Math.round(d.discountPct * 100)}%`,
      tone: "positive" as const,
    }));
  }, [result]);

  return (
    <div className="flex">
      <Sidebar active="/cards" />

      <main className="flex-1 min-w-0">
        <Ticker items={tickerItems} />

        <div className="max-w-5xl mx-auto px-6 py-10">
          <PageHeader
            eyebrow="Deal Scanner"
            title="Sports Card Deal Finder"
            subtitle="Searches active eBay listings and flags ones priced at or below the chosen fraction of the market comp price (eBay 90-day sold comps, when entitled, averaged with PriceCharting)."
          />

          <form
            onSubmit={runScan}
            className="bg-ink-card border border-ink-border rounded-2xl p-6 mb-8 card-glow grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]"
          >
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Card search</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. "2018 Panini Prizm Luka Doncic PSA 10"'
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Deal threshold</label>
              <select
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              >
                <option value={0.9}>≤ 90% of market</option>
                <option value={0.8}>≤ 80% of market</option>
                <option value={0.7}>≤ 70% of market</option>
                <option value={0.6}>≤ 60% of market</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Category ID (optional)</label>
              <input
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                placeholder="eBay category id"
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="self-end bg-ink-gold text-ink-bg font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
            >
              {loading ? "Scanning…" : "Scan"}
            </button>
          </form>

          {error && (
            <div className="bg-red-900/20 border border-ink-red rounded-xl p-4 text-ink-red text-sm mb-6">
              {error}
            </div>
          )}

          {result && (
            <>
              <StatPanel
                items={[
                  { label: "Market Price", value: `$${fmt(result.marketPrice)}` },
                  { label: "Active Listings", value: String(result.totalListings) },
                  {
                    label: "Deals Found",
                    value: String(result.deals.length),
                    delta: result.deals.length > 0 ? "Below threshold" : undefined,
                    deltaTone: "positive",
                  },
                  { label: "Comp Sources", value: result.sources.map((s) => s.name).join(", ") || "—" },
                ]}
              />

              {result.deals.length === 0 ? (
                <p className="text-gray-500 text-center py-12">
                  No listings currently at or below {Math.round(result.threshold * 100)}% of market price.
                </p>
              ) : (
                <div className="bg-ink-card border border-ink-border rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink-border">
                        <Th>Listing</Th>
                        <Th align="right">Price</Th>
                        <Th align="right">Market</Th>
                        <Th align="right">Discount</Th>
                        <Th align="right">Signal</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.deals.map((deal, i) => {
                        const badge = discountBadge(deal.discountPct);
                        return (
                          <tr
                            key={deal.itemId}
                            className={`border-b border-ink-border/60 last:border-0 hover:bg-white/5 transition-colors ${
                              i % 2 === 0 ? "" : "bg-white/[0.02]"
                            }`}
                          >
                            <td className="px-4 py-4">
                              <a
                                href={deal.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white font-medium hover:text-ink-gold hover:underline"
                              >
                                {deal.title}
                              </a>
                              {deal.condition && (
                                <p className="text-gray-600 text-xs mt-0.5">{deal.condition}</p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right text-white tabular-nums">
                              ${fmt(deal.totalPrice)}
                            </td>
                            <td className="px-4 py-4 text-right text-gray-400 tabular-nums">
                              ${fmt(deal.marketPrice)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-ink-green font-bold tabular-nums">
                                -{Math.round(deal.discountPct * 100)}%
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <Badge label={badge.label} tone={badge.tone} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-ink-border py-6 mt-12">
          <div className="max-w-5xl mx-auto px-6 text-center text-gray-600 text-xs">
            <p>
              Not affiliated with eBay or PriceCharting. Pricing data is informational only, not
              investment advice.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-3 ${
        align === "right" ? "text-right" : "text-left"
      } text-gray-500 text-xs uppercase tracking-widest font-medium`}
    >
      {children}
    </th>
  );
}
