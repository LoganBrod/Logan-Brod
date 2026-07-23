"use client";

import { useCallback, useState } from "react";
import SiteNav from "../components/SiteNav";
import type { ScanResult } from "../api/cards/scan/route";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  return (
    <main className="min-h-screen bg-roobet-dark">
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-white font-bold text-lg">Sports Card Deal Finder</h1>
          <SiteNav active="/cards" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm mb-6">
          Searches active eBay listings and flags ones priced at or below{" "}
          <span className="text-roobet-gold font-semibold">{Math.round(threshold * 100)}%</span> of the
          market comp price (eBay 90-day sold comps, when your app is entitled to Marketplace Insights,
          averaged with PriceCharting).
        </p>

        <form
          onSubmit={runScan}
          className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-8 card-glow grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <div className="flex flex-col gap-1">
            <label className="text-gray-500 text-xs uppercase tracking-widest">Card search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "2018 Panini Prizm Luka Doncic PSA 10"'
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-roobet-gold"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-500 text-xs uppercase tracking-widest">Deal threshold</label>
            <select
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-roobet-gold"
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
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-roobet-gold"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="self-end bg-roobet-gold text-roobet-dark font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
          >
            {loading ? "Scanning…" : "Scan"}
          </button>
        </form>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Market Price" value={`$${fmt(result.marketPrice)}`} />
              <Stat label="Active Listings" value={String(result.totalListings)} />
              <Stat label="Deals Found" value={String(result.deals.length)} />
              <Stat label="Comp Sources" value={result.sources.map((s) => s.name).join(", ") || "—"} />
            </div>

            {result.deals.length === 0 ? (
              <p className="text-gray-400 text-center py-12">
                No listings currently at or below {Math.round(result.threshold * 100)}% of market price.
              </p>
            ) : (
              <div className="bg-roobet-card border border-roobet-border rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-roobet-border">
                      <Th>Listing</Th>
                      <Th align="right">Price</Th>
                      <Th align="right">Market</Th>
                      <Th align="right">Discount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.deals.map((deal, i) => (
                      <tr
                        key={deal.itemId}
                        className={`border-b border-roobet-border/50 last:border-0 hover:bg-white/5 transition-colors ${
                          i % 2 === 0 ? "" : "bg-white/[0.02]"
                        }`}
                      >
                        <td className="px-4 py-4">
                          <a
                            href={deal.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-medium hover:text-roobet-gold hover:underline"
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
                          <span className="text-roobet-green font-bold tabular-nums">
                            -{Math.round(deal.discountPct * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-roobet-border py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p>
            Not affiliated with eBay or PriceCharting. Pricing data is informational only, not
            investment advice.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs uppercase tracking-widest">{label}</p>
      <p className="text-white font-bold text-lg mt-0.5 truncate">{value}</p>
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
