import Link from "next/link";
import Reveal from "@/components/Reveal";
import HeroBanner from "@/components/HeroBanner";

/**
 * Four steps rather than three: the point of the product isn't just writing
 * a listing, it's that the listing keeps getting optimized after it's live —
 * so that has to be on the landing page, not just something the app does
 * quietly after signup.
 */
const STEPS = [
  {
    n: "01",
    title: "Photograph it",
    desc: "Front and back. Vision reads the brand, size, materials, and any wear that's actually visible — nothing invented, nothing assumed.",
  },
  {
    n: "02",
    title: "It prices and lists it",
    desc: "Priced against what comparable items really sold for, not what someone's still hoping to get for theirs, then published straight to your eBay account.",
  },
  {
    n: "03",
    title: "It grades the listing",
    desc: "Every listing is scored 0–100 on the things that actually move a sale: title keywords, price against comps, photo coverage, category fit, how clearly the condition reads.",
  },
  {
    n: "04",
    title: "It proposes the fix",
    desc: "Anything scoring under 70 gets a concrete repair — more photos, a sharper title, a different price — not just a lower number. You approve it, it relists.",
  },
];

const FEATURES = [
  {
    icon: CameraIcon,
    title: "Photo to listing",
    desc: "Title, description, condition, and price written from the photos themselves, with a confidence score and an honest list of what the photos couldn't show.",
  },
  {
    icon: TagIcon,
    title: "Priced by what sold",
    desc: "Sold prices where your eBay account has access, otherwise active listings from sellers above 98% feedback. Always labelled so you know which you're seeing — never a guess dressed up as data.",
  },
  {
    icon: GaugeIcon,
    title: "Graded on signals, not vibes",
    desc: "Title keywords, item specifics, price vs. comps, description trust, condition clarity, photo coverage, category fit — seven dimensions, scored every time, not a vague sense of \"looks fine.\"",
  },
  {
    icon: WrenchIcon,
    title: "It fixes what it finds",
    desc: "A weak score names the exact weak spot and proposes the exact repair — a rewrite, a reprice, more photos — instead of leaving you to guess why something isn't moving.",
  },
  {
    icon: ProfitIcon,
    title: "Profit, not just revenue",
    desc: "Record what you paid, what shipping and fees cost, and where you sourced it. See margins per item, per category, and per supplier.",
  },
  {
    icon: BrainIcon,
    title: "It learns from your outcomes",
    desc: "Sold and stuck listings both teach it. The playbook rewrites itself as your results come in, so the grading gets sharper the more you sell — not a static checklist.",
  },
];

export default function LandingPage() {
  return (
    <div>
      <HeroBanner />

      {/* Marketplaces */}
      <section className="border-b border-ink-border bg-ink-deep px-5 py-4">
        <p className="text-center text-sm font-semibold text-fog/50">
          Built for eBay and Depop sellers, from one-off flips to full-time shops
        </p>
      </section>

      {/* How it works */}
      <section className="px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-[2.6rem] sm:leading-[1.05]">
              It doesn&apos;t stop at &quot;listed&quot;
            </h2>
            <p className="mt-3 text-base text-fog/55">
              Publishing is step two of four. The other half of the job is noticing when a
              listing isn&apos;t working and fixing it — automatically, on your approval.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} index={i}>
                <div className="h-full rounded-3xl border border-ink-border bg-ink-card p-6">
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
      <section className="border-t border-ink-border bg-ink-deep px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-[2.6rem] sm:leading-[1.05]">
              Built to keep optimizing
            </h2>
            <p className="mt-3 text-base text-fog/55">
              Not a one-shot generator. It grades every listing against real signals, tracks
              what your own sales reveal, and proposes the exact fix when something isn&apos;t
              working — instead of leaving a stale draft to quietly not sell.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} index={i}>
                <div className="h-full rounded-3xl border border-ink-border bg-ink-card p-6">
                  <span className="flex h-11 w-11 items-center justify-center bg-brand/10 text-brand">
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

      {/* Closing call to action. A full-bleed dark band rather than a bordered
          box marooned in white space, which is where the trailing gap was. */}
      <section className="bg-[#0d1112] px-5 py-14 text-white sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">
              Point a camera at it
            </h2>
            <p className="mt-3 text-base text-white/55">
              Two photos is enough to get a priced, written, ready-to-publish listing — graded
              and kept sharp after that, not left to fend for itself.
            </p>
          </div>
          <Link
            href="/new"
            className="shrink-0 self-start bg-brand px-7 py-3.5 text-sm font-bold text-[#0d1112] transition hover:bg-brand-dim"
          >
            Start a listing &rarr;
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
function GaugeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15a8 8 0 1 1 16 0" strokeLinecap="round" />
      <path d="M12 15 16 9" strokeLinecap="round" />
      <path d="M4 15h1M19 15h1M6.5 8.5l.7.7M17.5 8.5l-.7.7" strokeLinecap="round" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
