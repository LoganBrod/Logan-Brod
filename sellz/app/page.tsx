"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AnimatedNumber from "@/components/AnimatedNumber";
import Reveal from "@/components/Reveal";
import { Skeleton } from "@/components/Skeleton";
import PageHeader from "@/components/PageHeader";

interface Listing {
  id: string;
  title: string;
  platform: string;
  price: number;
  status: "draft" | "active" | "sold" | "stale" | "ended";
  source: "imported" | "generated";
  outcome?: { soldPrice?: number; listedAt?: string; soldAt?: string };
  brainScore?: { score: number };
  createdAt: string;
}

interface Playbook {
  updatedAt: string;
  summary: string;
}

const STATUS_DOT: Record<string, string> = {
  sold: "bg-brand",
  stale: "bg-amber-400",
  active: "bg-fog/50",
  draft: "bg-fog/30",
  ended: "bg-fog/20",
};

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (!isFinite(start) || !isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export default function Dashboard() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);

  useEffect(() => {
    fetch("/api/listings").then((r) => r.json()).then(setListings).catch(() => setListings([]));
    fetch("/api/evolve").then((r) => r.json()).then(setPlaybook).catch(() => {});
  }, []);

  const stats = useMemo(() => {
    if (!listings) return null;
    const sold = listings.filter((l) => l.status === "sold");
    const decided = listings.filter((l) => ["sold", "stale", "ended"].includes(l.status));
    const revenue = sold.reduce((sum, l) => sum + (l.outcome?.soldPrice ?? 0), 0);
    const sellTimes = sold
      .map((l) => daysBetween(l.outcome?.listedAt, l.outcome?.soldAt))
      .filter((d): d is number => d !== null);
    const avgDays = sellTimes.length
      ? sellTimes.reduce((a, b) => a + b, 0) / sellTimes.length
      : null;
    const sellThrough = decided.length ? (sold.length / decided.length) * 100 : null;
    return {
      total: listings.length,
      sold: sold.length,
      revenue,
      avgDays,
      sellThrough,
    };
  }, [listings]);

  const recent = useMemo(
    () => (listings ? [...listings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5) : []),
    [listings]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Levo"
        accent="Z"
        subtitle="Listings that learn what sells — one loop at a time."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-7 w-20" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Listings" value={<AnimatedNumber value={stats.total} />} index={0} />
            <StatCard
              label="Sold"
              value={<AnimatedNumber value={stats.sold} />}
              sub={stats.sellThrough !== null ? `${stats.sellThrough.toFixed(0)}% sell-through` : undefined}
              index={1}
            />
            <StatCard
              label="Revenue"
              value={<AnimatedNumber value={stats.revenue} prefix="$" />}
              index={2}
            />
            <StatCard
              label="Avg. days to sell"
              value={stats.avgDays !== null ? <AnimatedNumber value={stats.avgDays} decimals={1} /> : "—"}
              index={3}
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickAction
          href="/generate"
          title="Write a listing"
          desc="Describe an item, get playbook-driven drafts"
          index={0}
        />
        <QuickAction
          href="/listings"
          title="Import history"
          desc="Feed sold + stuck listings to the Brain"
          index={1}
        />
        <QuickAction
          href="/brain"
          title="Analyze performance"
          desc="Turn outcomes into a sharper playbook"
          index={2}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent listings */}
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            Recent listings
          </h2>
          {!listings ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-fog/40">
              Nothing yet —{" "}
              <Link href="/listings" className="text-brand hover:underline">
                import your history
              </Link>{" "}
              or{" "}
              <Link href="/generate" className="text-brand hover:underline">
                generate a listing
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((l, i) => (
                <Reveal key={l.id} index={i}>
                  <Link
                    href="/listings"
                    className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-card px-4 py-3 shadow-card transition hover:border-brand/40"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[l.status]}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fog">
                      {l.title}
                    </span>
                    <span className="shrink-0 text-xs text-fog/40">
                      {l.platform} · ${l.price}
                    </span>
                    {l.brainScore && (
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold " +
                          (l.brainScore.score >= 70
                            ? "bg-brand/15 text-brand"
                            : l.brainScore.score >= 40
                              ? "bg-ink-border text-fog/70"
                              : "bg-red-500/15 text-red-400")
                        }
                      >
                        {l.brainScore.score}
                      </span>
                    )}
                  </Link>
                </Reveal>
              ))}
            </ul>
          )}
        </section>

        {/* Playbook teaser */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
            The Brain
          </h2>
          <Reveal>
            <Link
              href="/brain"
              className="block rounded-2xl border border-brand/30 bg-ink-card p-5 shadow-card transition hover:border-brand/60"
            >
              {playbook ? (
                <>
                  <p className="text-sm text-fog/80">{playbook.summary}</p>
                  <p className="mt-3 text-xs text-fog/40">
                    Last analyzed {new Date(playbook.updatedAt).toLocaleDateString()}
                  </p>
                </>
              ) : (
                <p className="text-sm text-fog/60">
                  No playbook yet — import a few outcomes or pre-feed reference
                  listings, then analyze on the Brain page.
                </p>
              )}
              <span className="mt-3 inline-block text-sm font-semibold text-brand">
                Open Brain →
              </span>
            </Link>
          </Reveal>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  index,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  index: number;
}) {
  return (
    <Reveal index={index}>
      <div className="rounded-2xl border border-ink-border bg-ink-card p-4 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-fog/40">{label}</p>
        <p className="mt-1 text-2xl font-extrabold text-fog">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-brand">{sub}</p>}
      </div>
    </Reveal>
  );
}

function QuickAction({
  href,
  title,
  desc,
  index,
}: {
  href: string;
  title: string;
  desc: string;
  index: number;
}) {
  return (
    <Reveal index={index}>
      <Link
        href={href}
        className="group block rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card transition hover:border-brand/50"
      >
        <p className="font-bold text-fog">{title}</p>
        <p className="mt-1 text-sm text-fog/50">{desc}</p>
        <span className="mt-3 inline-block text-sm font-semibold text-brand transition group-hover:translate-x-1">
          →
        </span>
      </Link>
    </Reveal>
  );
}
