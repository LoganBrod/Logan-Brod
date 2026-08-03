import Link from "next/link";
import Reveal from "@/components/Reveal";
import HeroBanner from "@/components/HeroBanner";
import PrimaryButton from "@/components/PrimaryButton";

/**
 * Four steps rather than three: the point of the product isn't just writing
 * a listing, it's that the listing keeps getting optimized after it's live —
 * so that has to be on the landing page, not just something the app does
 * quietly after signup.
 */
const STEPS = [
  {
    n: "01",
    title: "Take a photo",
    desc: "Front and back is enough. It reads the brand, the size, the material and any wear it can actually see — it won't make things up to fill gaps.",
  },
  {
    n: "02",
    title: "It tells you what it's worth",
    desc: "Based on what ones like it actually sold for, not what people are still hoping to get. You get a price you can defend, and the listing written for you.",
  },
  {
    n: "03",
    title: "Post it wherever you sell",
    desc: "A Depop version ready to copy and paste, hashtags and all — or one tap to put it live on eBay.",
  },
  {
    n: "04",
    title: "It tells you why it isn't selling",
    desc: "If something sits, it says what's wrong and fixes it — better photos, a sharper title, a different price. Not just \"try lowering it.\"",
  },
];

const FEATURES = [
  {
    icon: CameraIcon,
    title: "Photo in, listing out",
    desc: "Title, description, condition and price, written from the photo. It also tells you how sure it is, and what it couldn't work out from the pictures.",
  },
  {
    icon: TagIcon,
    title: "A price you can back up",
    desc: "Based on real sales where we can see them, and on what similar things are currently going for otherwise. It always says which — never a guess dressed up as data.",
  },
  {
    icon: GaugeIcon,
    title: "Ready to paste into Depop",
    desc: "A shorter, punchier version with hashtags and the right condition wording, plus your photos in one tap. Depop has no API, so nobody can post for you — this gets it down to about ten seconds.",
  },
  {
    icon: WrenchIcon,
    title: "It fixes what's not working",
    desc: "Something sitting for weeks gets a specific fix — a rewrite, a new price, better photos — instead of leaving you to guess what's wrong with it.",
  },
  {
    icon: ProfitIcon,
    title: "What you actually made",
    desc: "Put in what you paid for something and it works out what you really kept after shipping and fees. Plus which places you find stuff are worth going back to.",
  },
  {
    icon: BrainIcon,
    title: "It learns what you sell",
    desc: "The things that sell and the things that don't both teach it. It gets better at pricing your kind of stuff the more you sell.",
  },
];

export default function LandingPage() {
  return (
    <div>
      <HeroBanner />

      {/* Marketplaces */}
      <section className="border-b border-ink-border bg-ink-deep px-5 py-4">
        <p className="text-center text-sm font-semibold text-fog/50">
          For anyone flipping thrift finds on Depop or eBay
        </p>
      </section>

      {/* How it works */}
      <section className="px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-fog sm:text-[2.6rem] sm:leading-[1.05]">
              From your floor to sold
            </h2>
            <p className="mt-3 text-base text-fog/55">
              Posting it is the easy half. The other half is noticing when something
              isn&apos;t selling and doing something about it — which is where most stuff
              quietly dies.
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
              It keeps working after you post
            </h2>
            <p className="mt-3 text-base text-fog/55">
              Not just a caption generator. It checks how each listing is doing, learns from
              what you actually sell, and tells you exactly what to change when something
              sits — instead of leaving it there to go stale.
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
              Got something to sell?
            </h2>
            <p className="mt-3 text-base text-white/55">
              Two photos and you&apos;ll have a priced, written listing ready to go — and
              something keeping an eye on it after that.
            </p>
          </div>
          <div className="shrink-0 self-start">
            <PrimaryButton href="/new">Sell something &rarr;</PrimaryButton>
          </div>
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
