import Link from "next/link";
import Reveal from "@/components/Reveal";
import HeroShowcase from "@/components/HeroShowcase";

const STEPS = [
  {
    n: "01",
    title: "Photograph it",
    desc: "Front and back. Vision reads the item, the brand, the size, and any wear that is actually visible.",
  },
  {
    n: "02",
    title: "It prices it",
    desc: "Comped against what comparable items sold for, weighted to sellers with strong feedback, plus your own history.",
  },
  {
    n: "03",
    title: "You approve",
    desc: "Review the draft, change anything, and publish straight to eBay. Nothing goes live without you.",
  },
];

const FEATURES = [
  {
    icon: CameraIcon,
    title: "Photo to listing",
    desc: "Title, description, condition, and price written from the photos themselves, with a confidence score and an honest list of what the photos could not show.",
  },
  {
    icon: TagIcon,
    title: "Real comparables",
    desc: "Sold prices where your eBay account has access, otherwise active listings from sellers above 98% feedback. Always labelled so you know which you are seeing.",
  },
  {
    icon: ProfitIcon,
    title: "Profit, not just revenue",
    desc: "Record what you paid, what shipping and fees cost, and where you sourced it. See margins per item, per category, and per supplier.",
  },
  {
    icon: BrainIcon,
    title: "It learns from outcomes",
    desc: "Sold and stuck listings both teach it. The playbook rewrites itself as your results come in, and running experiments get judged on real numbers.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-4 pt-14 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-rise text-xs font-bold uppercase tracking-[0.25em] text-brand">
            For resellers
          </p>
          <h1 className="animate-rise mt-4 text-[2.6rem] font-extrabold leading-[1.03] tracking-tight text-fog sm:text-6xl">
            Smarter listings.
            <br />
            Priced by what sold.
          </h1>
          <p className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-fog/60 sm:text-lg">
            Photograph an item and LevoZ writes the listing, prices it against real
            sales, and posts it to eBay once you approve.
          </p>
          <div className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/new"
              className="rounded-full bg-brand px-7 py-3.5 text-sm font-bold text-ink shadow-glow transition hover:bg-brand-dim"
            >
              Start a listing
            </Link>
            <Link
              href="/analytics"
              className="rounded-full border border-ink-border bg-ink-card px-7 py-3.5 text-sm font-semibold text-fog transition hover:border-brand/50"
            >
              See your numbers
            </Link>
          </div>
        </div>

        <div className="animate-emerge mt-4">
          <HeroShowcase />
        </div>
      </section>

      {/* Marketplaces */}
      <section className="border-y border-ink-border/60 bg-ink-deep/30 px-5 py-8">
        <p className="text-center text-sm font-semibold text-fog/50">
          Built for eBay and Depop sellers, from one-off flips to full-time shops
        </p>
      </section>

      {/* How it works */}
      <section className="px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-4xl">
              Three steps, start to listed
            </h2>
            <p className="mt-3 text-base text-fog/55">
              The whole loop runs from your phone camera to a live eBay listing.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} index={i}>
                <div className="h-full rounded-3xl border border-ink-border bg-ink-card p-7 shadow-card">
                  <span className="text-sm font-extrabold text-brand">{s.n}</span>
                  <p className="mt-3 text-lg font-bold text-fog">{s.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-fog/55">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-border/60 bg-ink-deep/30 px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-4xl">
              Everything the listing needs
            </h2>
            <p className="mt-3 text-base text-fog/55">
              Not a template filler. It reads the item, checks the market, and tracks
              what each sale actually earned.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} index={i}>
                <div className="h-full rounded-3xl border border-ink-border bg-ink-card p-7 shadow-card">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <f.icon />
                  </span>
                  <p className="mt-4 text-lg font-bold text-fog">{f.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-fog/55">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-ink-border bg-ink-card p-10 text-center shadow-card sm:p-14">
          <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-4xl">
            Point a camera at it
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-base text-fog/55">
            Two photos is enough to get a priced, written, ready to publish listing.
          </p>
          <Link
            href="/new"
            className="mt-8 inline-block rounded-full bg-brand px-8 py-3.5 text-sm font-bold text-ink shadow-glow transition hover:bg-brand-dim"
          >
            Start a listing
          </Link>
        </div>
      </section>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="14" rx="2" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8 6l1.5-2h5L16 6" strokeLinejoin="round" />
    </svg>
  );
}
function ProfitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BrainIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v5c0 .4.16.78.44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l5-5a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.5 4Z"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
