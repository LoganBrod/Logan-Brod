"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Usage {
  plan: "free" | "pro" | "business";
  listings: { used: number; limit: number | null };
  research: { used: number; limit: number | null };
  usageResetAt: string | null;
  hasSubscription: boolean;
  billingConfigured: boolean;
}

const PLAN_LABEL: Record<Usage["plan"], string> = {
  free: "Free",
  pro: "Pro — $29/month",
  business: "Business — $79/month",
};

export default function BillingPage() {
  const toast = useToast();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  async function openPortal() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't open the portal");
      window.location.href = data.url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Couldn't open the portal", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-14 space-y-6">
      <PageHeader title="Billing" subtitle="Your plan and what you've used this month." />

      {!usage ? (
        <div className="h-32 animate-pulse rounded-2xl bg-ink-deep" />
      ) : (
        <>
          <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fog/45">Current plan</p>
            <p className="mt-1 text-xl font-extrabold text-fog">{PLAN_LABEL[usage.plan]}</p>

            <div className="mt-5 space-y-4">
              <Meter
                label="AI listings"
                used={usage.listings.used}
                limit={usage.listings.limit}
              />
              {usage.plan !== "free" && (
                <Meter
                  label="Brain research passes"
                  used={usage.research.used}
                  limit={usage.research.limit}
                />
              )}
            </div>

            {usage.usageResetAt && (
              <p className="mt-4 text-xs text-fog/35">
                Allowance resets{" "}
                {new Date(
                  new Date(usage.usageResetAt).getTime() + 30 * 24 * 60 * 60 * 1000
                ).toLocaleDateString()}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
            {!usage.billingConfigured ? (
              <p className="text-sm text-amber-400">
                Billing isn&apos;t configured on this deployment yet, so plans can&apos;t be
                changed from here.
              </p>
            ) : usage.hasSubscription ? (
              <>
                <p className="text-sm text-fog/70">
                  Change plan, update your card, or cancel — all handled by Stripe.
                </p>
                <button
                  onClick={openPortal}
                  disabled={busy}
                  className="mt-4 rounded-xl bg-brand px-5 py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
                >
                  {busy ? "Opening…" : "Manage subscription"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-fog/70">
                  You&apos;re on the free plan. Pro adds ongoing Brain proposals, auto-publish and
                  auto-relist.
                </p>
                <Link
                  href="/pricing"
                  className="mt-4 inline-block rounded-xl bg-brand px-5 py-3 font-bold text-ink transition hover:bg-brand-dim"
                >
                  See plans
                </Link>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  // A null limit means unlimited — render it as such rather than as a bar
  // that is permanently almost empty.
  const pct = limit === null ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const nearLimit = limit !== null && used >= limit * 0.8;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-fog/60">{label}</span>
        <span className={nearLimit ? "font-semibold text-amber-400" : "text-fog/70"}>
          {limit === null ? `${used} used · unlimited` : `${used} of ${limit}`}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-border">
          <div
            className={"h-full transition-all " + (nearLimit ? "bg-amber-400" : "bg-brand")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
