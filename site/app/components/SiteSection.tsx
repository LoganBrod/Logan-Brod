import Link from "next/link";
import { company, isTodo, legal, siteSection } from "@/lib/copy";
import { Wordmark } from "./Logo";

/**
 * Where the product's own pages are, listed at the foot of the walk.
 *
 * Deliberately not imported from the menu's own list: this one omits "About",
 * because linking the page you are already on from its own footer is noise.
 */
const SECTIONS = [
  { href: "/closet", label: "Clozet" },
  { href: "/accessories", label: "Accessories" },
  { href: "/colognes", label: "Colognes" },
] as const;

/**
 * The close: the mark, the door into the product, and the way to reach us.
 *
 * This section used to carry a heading and a paragraph about the company,
 * both of which have gone. Anyone standing here has read four beats about
 * what the thing does and then watched the corridor; a fifth explanation
 * between them and the button was the page talking past its own ending.
 *
 * Plain document flow - nothing here is scroll-driven.
 */
export default function SiteSection() {
  const appReady = !isTodo(siteSection.appUrl);

  return (
    <section aria-label={company} className="relative w-full border-t border-room-line bg-room-panel">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-6 py-24 text-center">
        <Link href="/" aria-label="LevoZ Labs, home">
          <Wordmark size="lg" />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-4">
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

      {/* The way in, spelled out. The header carries these too from the width
          where they fit; below that this row is the only list of them. */}
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

      {/* Below the section list rather than in it: these are the two links a
          person looks for when they have already decided to check something,
          and putting them level with "Clozet" would give them a weight they
          do not want. */}
      <p className="pb-8 text-center text-[11px] text-room-faint">
        {legal}
        {" · "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-room-ink">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-room-ink">
          Terms
        </Link>
      </p>
    </section>
  );
}
