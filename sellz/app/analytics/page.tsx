"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import AnimatedNumber from "@/components/AnimatedNumber";
import Reveal from "@/components/Reveal";
import { Skeleton } from "@/components/Skeleton";

interface Listing {
  id: string;
  title: string;
  platform: string;
  price: number;
  category: string;
  status: string;
  outcome?: { soldPrice?: number; listedAt?: string; soldAt?: string };
  cost?: { purchasePrice?: number; shippingCost?: number; fees?: number; source?: string };
  createdAt: string;
}

interface Row {
  listing: Listing;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  complete: boolean;
  daysToSell: number | null;
}

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const s = Date.parse(a);
  const e = Date.parse(b);
  if (!isFinite(s) || !isFinite(e)) return null;
  return Math.max(0, Math.round((e - s) / 86400000));
}

function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

/** Group rows by a key and rank groups by average margin. */
function groupBy(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r).trim();
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return Array.from(map.entries())
    .map(([name, items]) => ({
      name,
      count: items.length,
      profit: items.reduce((s, r) => s + r.profit, 0),
      avgMargin: items.reduce((s, r) => s + r.marginPct, 0) / items.length,
    }))
    .sort((a, b) => b.avgMargin - a.avgMargin);
}

export default function AnalyticsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    fetch("/api/listings")
      .then((r) => r.json())
      .then(setListings)
      .catch(() => setListings([]));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!listings) return [];
    return listings
      .filter((l) => l.status === "sold" && l.outcome?.soldPrice !== undefined)
      .map((l) => {
        const revenue = l.outcome!.soldPrice!;
        const purchase = l.cost?.purchasePrice;
        const cost = (purchase ?? 0) + (l.cost?.shippingCost ?? 0) + (l.cost?.fees ?? 0);
        const profit = revenue - cost;
        return {
          listing: l,
          revenue,
          cost,
          profit,
          marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
          complete: purchase !== undefined,
          daysToSell: daysBetween(l.outcome?.listedAt, l.outcome?.soldAt),
        };
      });
  }, [listings]);

  // Margin claims are only honest for items whose cost we actually know.
  const priced = useMemo(() => rows.filter((r) => r.complete), [rows]);
  const missingCost = rows.length - priced.length;

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const profit = priced.reduce((s, r) => s + r.profit, 0);
    const spend = priced.reduce((s, r) => s + r.cost, 0);
    const avgMargin = priced.length
      ? priced.reduce((s, r) => s + r.marginPct, 0) / priced.length
      : null;
    const sellTimes = priced.map((r) => r.daysToSell).filter((d): d is number => d !== null);
    return {
      revenue,
      profit,
      spend,
      avgMargin,
      avgDays: sellTimes.length ? sellTimes.reduce((a, b) => a + b, 0) / sellTimes.length : null,
    };
  }, [rows, priced]);

  const byMargin = useMemo(() => [...priced].sort((a, b) => b.marginPct - a.marginPct), [priced]);
  const byCategory = useMemo(() => groupBy(priced, (r) => r.listing.category), [priced]);
  const bySource = useMemo(() => groupBy(priced, (r) => r.listing.cost?.source ?? ""), [priced]);

  if (!listings) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" subtitle="Profit, margins, and what's actually worth sourcing." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-7 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" subtitle="Profit, margins, and what's actually worth sourcing." />
        <p className="rounded-2xl border border-ink-border bg-ink-card p-6 text-sm text-fog/50 shadow-card">
          No sold items yet. Once a listing is marked <span className="text-fog">sold</span> with a
          sale price, it shows up here —{" "}
          <Link href="/listings" className="text-brand hover:underline">
            add your sold history
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" subtitle="Profit, margins, and what's actually worth sourcing." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Revenue" value={<AnimatedNumber value={totals.revenue} prefix="$" decimals={2} />} index={0} />
        <Stat
          label="Profit"
          value={<AnimatedNumber value={totals.profit} prefix="$" decimals={2} />}
          sub={missingCost > 0 ? `${priced.length} of ${rows.length} priced` : undefined}
          positive={totals.profit >= 0}
          index={1}
        />
        <Stat
          label="Avg. margin"
          value={totals.avgMargin !== null ? <AnimatedNumber value={totals.avgMargin} suffix="%" decimals={1} /> : "—"}
          index={2}
        />
        <Stat label="Spent on stock" value={<AnimatedNumber value={totals.spend} prefix="$" decimals={2} />} index={3} />
      </div>

      {missingCost > 0 && (
        <p className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
          {missingCost} sold {missingCost === 1 ? "item has" : "items have"} no purchase price
          recorded, so {missingCost === 1 ? "it's" : "they're"} left out of profit and margin.
          Add what you paid on the{" "}
          <Link href="/listings" className="underline">
            Listings
          </Link>{" "}
          page (Cost tab) to include {missingCost === 1 ? "it" : "them"}.
        </p>
      )}

      {byMargin.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Best margins
          </h2>
          <div className="space-y-2">
            {byMargin.slice(0, 5).map((r, i) => (
              <Reveal key={r.listing.id} index={i}>
                <MarginRow row={r} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Only worth a separate section once there are enough items that the
          worst ones aren't already listed above as "best". */}
      {byMargin.length > 6 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Thinnest margins
          </h2>
          <div className="space-y-2">
            {byMargin
              .slice(5)
              .slice(-3)
              .reverse()
              .map((r, i) => (
                <Reveal key={r.listing.id} index={i}>
                  <MarginRow row={r} />
                </Reveal>
              ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {byCategory.length > 0 && (
          <GroupTable
            title="Margin by category"
            empty="No categories recorded yet."
            rows={byCategory}
          />
        )}
        {bySource.length > 0 ? (
          <GroupTable title="Margin by source" empty="" rows={bySource} />
        ) : (
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
              Margin by source
            </h2>
            <p className="rounded-2xl border border-ink-border bg-ink-card p-5 text-sm text-fog/40 shadow-card">
              Record where you sourced items (Cost tab on a listing) and this will show which
              suppliers, thrift spots, or wholesalers actually pay off.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  positive,
  index,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  positive?: boolean;
  index: number;
}) {
  return (
    <Reveal index={index}>
      <div className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-fog/40">{label}</p>
        <p
          className={
            "mt-1 text-2xl font-extrabold " +
            (positive === undefined ? "text-fog" : positive ? "text-brand" : "text-red-400")
          }
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-fog/40">{sub}</p>}
      </div>
    </Reveal>
  );
}

function MarginRow({ row }: { row: Row }) {
  const good = row.marginPct >= 40;
  const bad = row.marginPct < 15;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-card px-4 py-3 shadow-card">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fog">{row.listing.title}</span>
        <span className="text-xs text-fog/40">
          {money(row.cost)} → {money(row.revenue)}
          {row.daysToSell !== null && ` · ${row.daysToSell}d to sell`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={
            "block text-sm font-bold " +
            (row.profit >= 0 ? "text-brand" : "text-red-400")
          }
        >
          {money(row.profit)}
        </span>
        <span
          className={
            "text-xs font-semibold " +
            (good ? "text-brand" : bad ? "text-red-400" : "text-fog/40")
          }
        >
          {row.marginPct.toFixed(0)}%
        </span>
      </span>
    </div>
  );
}

function GroupTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; count: number; profit: number; avgMargin: number }[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ink-border bg-ink-card p-5 text-sm text-fog/40 shadow-card">
          {empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-border bg-ink-card shadow-card">
          {rows.slice(0, 8).map((g, i) => (
            <div
              key={g.name}
              className={
                "flex items-center gap-3 px-4 py-3 text-sm " +
                (i > 0 ? "border-t border-ink-border/60" : "")
              }
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-fog">{g.name}</span>
              <span className="shrink-0 text-xs text-fog/40">
                {g.count} sold · {money(g.profit)}
              </span>
              <span
                className={
                  "shrink-0 text-sm font-bold " +
                  (g.avgMargin >= 40 ? "text-brand" : g.avgMargin < 15 ? "text-red-400" : "text-fog/70")
                }
              >
                {g.avgMargin.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
