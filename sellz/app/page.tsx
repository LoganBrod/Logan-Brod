"use client";

import Link from "next/link";
import Reveal from "@/components/Reveal";
import HeroShowcase from "@/components/HeroShowcase";

const STEPS = [
  { n: "1", title: "Photograph it", desc: "Front and back. Vision reads the item, brand, size, and any visible flaws." },
  { n: "2", title: "It prices it", desc: "Comped against what similar items actually sold for, plus what has worked for you before." },
  { n: "3", title: "You approve", desc: "Review the draft, change anything, and list it straight to eBay." },
];

const SHORTCUTS = [
  { href: "/new", title: "New listing", desc: "Photo in, finished listing out, then straight to eBay", icon: CameraIcon },
  { href: "/analytics", title: "Analytics", desc: "Profit, margins, and which sources actually pay off", icon: ProfitIcon },
  { href: "/dashboard", title: "Dashboard", desc: "Sold, revenue, sell-through, and recent activity", icon: ChartIcon },
  { href: "/listings", title: "Listings", desc: "Your history: grades, comps, costs, and what is stuck", icon: TagIcon },
  { href: "/brain", title: "Brain", desc: "Settings, the playbook, and your eBay connection", icon: BrainIcon },
  { href: "/generate", title: "Write from text", desc: "No photos handy? Describe the item instead", icon: SparkIcon },
];

export default function LandingPage() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="animate-rise">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-fog sm:text-5xl">
            Photograph it.
            <br />
            <span className="text-brand">It writes the listing.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-fog/60">
            Clothing, collectables, sneakers, cameras. LevoZ identifies the item,
            prices it against real sales, and lists it to eBay once you approve.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/new"
              className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink transition hover:bg-brand-dim"
            >
              Start a listing
            </Link>
            <Link
              href="/analytics"
              className="rounded-full border border-ink-border bg-ink-card px-6 py-3 text-sm font-semibold text-fog transition hover:border-brand/50"
            >
              See your numbers
            </Link>
          </div>
        </div>

        <div className="animate-emerge">
          <HeroShowcase />
        </div>
      </section>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} index={i}>
              <div className="h-full rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card">
                <span className="text-xs font-bold tracking-wide text-brand">STEP {s.n}</span>
                <p className="mt-1 font-bold text-fog">{s.title}</p>
                <p className="mt-1 text-sm text-fog/50">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
          Jump in
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHORTCUTS.map((s, i) => (
            <Reveal key={s.href} index={i}>
              <Link
                href={s.href}
                className="group flex items-start gap-4 rounded-2xl border border-ink-border bg-ink-card p-5 shadow-card transition hover:border-brand/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <s.icon />
                </span>
                <span className="min-w-0">
                  <p className="font-bold text-fog">{s.title}</p>
                  <p className="mt-0.5 text-sm text-fog/50">{s.desc}</p>
                  <span className="mt-2 inline-block text-sm font-semibold text-brand transition group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="14" rx="2" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8 6l1.5-2h5L16 6" strokeLinejoin="round" />
    </svg>
  );
}
function ProfitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5v.6A3 3 0 0 0 5 10v1a3 3 0 0 0 1 2.24V15a3 3 0 0 0 3 3v0a2 2 0 0 0 2-2V6.5A2.5 2.5 0 0 0 9.5 4Z"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4A2.5 2.5 0 0 1 17 6.5v.6A3 3 0 0 1 19 10v1a3 3 0 0 1-1 2.24V15a3 3 0 0 1-3 3v0a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 14.5 4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v5c0 .4.16.78.44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l5-5a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.5 4Z"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
