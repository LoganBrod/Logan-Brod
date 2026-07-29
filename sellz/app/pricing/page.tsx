"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";

interface Tier {
  id: "free" | "pro" | "business";
  name: string;
  price: string;
  blurb: string;
  features: string[];
  missing?: string[];
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "Enough to see whether the listings are actually better.",
    features: [
      "10 AI listings a month",
      "Photo-to-listing pipeline",
      "Real eBay comps and retail research",
      "Listing grading across 7 signals",
      "Publish straight to eBay",
    ],
    missing: ["Ongoing Brain proposals", "Auto-publish", "Auto-relist"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    blurb: "For sellers listing every week who want it watching the shop.",
    features: [
      "100 AI listings a month",
      "Everything in Free",
      "Nightly Brain proposals on live listings",
      "Auto-publish high-scoring drafts",
      "Auto-relist stale listings",
      "Best-offer auto-accept",
    ],
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    price: "$79",
    blurb: "For full-time resellers moving real volume.",
    features: [
      "Unlimited AI listings",
      "Everything in Pro",
      "Batch mode for large intakes",
      "Priority processing",
    ],
  },
];

export default function PricingPage() {
  const { status } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: "pro" | "business") {
    if (status !== "authenticated") {
      window.location.href = `/signup?next=/pricing`;
      return;
    }
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <PageHeader
        title="Pricing"
        subtitle="The AI is on us — there's no API key to bring. Cancel whenever."
      />

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {TIERS.map((tier, i) => (
          <Reveal key={tier.id} index={i}>
            <div
              className={
                "flex h-full flex-col rounded-2xl border p-6 shadow-card " +
                (tier.featured
                  ? "border-brand bg-ink-card shadow-glow"
                  : "border-ink-border bg-ink-card")
              }
            >
              {tier.featured && (
                <span className="mb-3 w-fit bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-extrabold text-fog">{tier.name}</h2>
              <p className="mt-1 text-3xl font-extrabold text-fog">
                {tier.price}
                {tier.id !== "free" && (
                  <span className="text-sm font-semibold text-fog/40">/month</span>
                )}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fog/60">{tier.blurb}</p>

              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-fog/70">
                    <span className="text-brand">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
                {tier.missing?.map((f) => (
                  <li key={f} className="flex gap-2 text-fog/30">
                    <span>—</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {tier.id === "free" ? (
                  <Link
                    href={status === "authenticated" ? "/new" : "/signup"}
                    className="block rounded-xl bg-ink-border px-5 py-3 text-center font-bold text-fog transition hover:bg-ink-border/70"
                  >
                    {status === "authenticated" ? "Start listing" : "Get started free"}
                  </Link>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => subscribe(tier.id as "pro" | "business")}
                    disabled={busy !== null}
                    className={
                      "w-full rounded-xl px-5 py-3 font-bold transition disabled:opacity-50 " +
                      (tier.featured
                        ? "bg-brand text-ink hover:bg-brand-dim"
                        : "bg-ink-border text-fog hover:bg-ink-border/70")
                    }
                  >
                    {busy === tier.id ? "Opening checkout…" : `Subscribe to ${tier.name}`}
                  </motion.button>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-fog/40">
        A &ldquo;listing&rdquo; is one full analysis: identification, eBay comps, retail research,
        a rewrite pass and a grade. You&apos;ll need your own eBay account to publish.
      </p>
    </div>
  );
}
