import Link from "next/link";
import { company, isTodo, legal, siteSection } from "@/lib/copy";

/**
 * Where the product's own pages are, listed at the foot of the walk.
 *
 * Deliberately not imported from the menu's own list: this one omits "About",
 * because linking the page you are already on from its own footer is noise.
 */
const SECTIONS = [
  { href: "/closet", label: "Clozet" },
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/tools", label: "Tools" },
  { href: "/accessories", label: "Accessories" },
  { href: "/colognes", label: "Colognes" },
  { href: "/discover", label: "Discover" },
  { href: "/closets", label: "Saved" },
] as const;

/**
 * After the cinema, the actual website: who this is, and the door to the real
 * Closet app. Plain document flow — nothing here is scroll-driven.
 */
export default function SiteSection() {
  const appReady = !isTodo(siteSection.appUrl);

  return (
    <section aria-label={company} className="relative w-full border-t border-room-line bg-room-panel">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-28 text-center">
        {/* The last of the small-caps stamps. It was 11px at 0.22em tracking,
            which on this section made three different all-caps devices — this,
            both buttons, and seven nav links — stack up in one screen. */}
        <span className="eyebrow">{company}</span>

        <h2
          className={`display text-room-ink [font-size:clamp(2rem,4vw,3.5rem)] leading-tight ${
            isTodo(siteSection.heading) ? "opacity-40" : ""
          }`}
        >
          {siteSection.heading}
        </h2>

        {/*
          The one thing on this section that isn't centred, because it is the
          one thing long enough for centring to hurt. Six lines of centred prose
          have a ragged left edge, and a reader's eye has to hunt for the start
          of every line. The block stays centred; the words inside it don't.
        */}
        <p
          className={`max-w-[58ch] text-left text-[15px] leading-relaxed text-room-muted ${
            isTodo(siteSection.body) ? "opacity-40" : ""
          }`}
        >
          {siteSection.body}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <a
            href={appReady ? siteSection.appUrl : "#"}
            aria-disabled={!appReady}
            /* Matched to the app's own `.btn`: 12px at 0.1em rather than 13px
               at 0.22em. The same button on this page and inside the product
               should not be two different objects. */
            className={`rounded-sm border border-accent bg-accent px-8 py-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-room-panel transition-colors duration-200 ease-out hover:border-accent-soft hover:bg-accent-soft ${
              appReady ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            {siteSection.appLabel}
          </a>
          <a
            href={siteSection.contactHref}
            className="rounded-sm border border-accent px-8 py-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent transition-colors duration-200 ease-out hover:bg-accent hover:text-room-panel"
          >
            {siteSection.contactLabel}
          </a>
        </div>
      </div>

      {/* The way in, spelled out. The menu button is always there, but someone
          who has just scrolled the whole corridor shouldn't have to go looking
          for a hamburger to find out what else exists. */}
      <nav
        aria-label="Sections"
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-8 border-t border-room-line/70 px-6 py-8 sm:gap-y-3 sm:py-10"
      >
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            /* py-2 on phones only: six 18px-tall links in a wrapped row are
               three of them under a thumb at once.

               Sentence case, like the menu these mirror. A row of seven
               all-caps words is read as a graphic band rather than as seven
               places you can go. */
            className="py-2 text-[13px] text-room-muted transition-colors duration-200 ease-out hover:text-accent sm:py-0"
          >
            {section.label}
          </Link>
        ))}
      </nav>

      <p className="pb-8 text-center text-[11px] text-room-faint">{legal}</p>
    </section>
  );
}
