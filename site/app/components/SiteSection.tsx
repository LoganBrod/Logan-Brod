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
  { href: "/sizing", label: "Sizing" },
  { href: "/scan", label: "Scan" },
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
        <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{company}</span>

        <h2
          className={`font-serif text-room-ink [font-size:clamp(2rem,4vw,3.5rem)] leading-tight ${
            isTodo(siteSection.heading) ? "opacity-40" : ""
          }`}
        >
          {siteSection.heading}
        </h2>

        <p
          className={`max-w-[65ch] text-[15px] leading-relaxed text-room-muted ${
            isTodo(siteSection.body) ? "opacity-40" : ""
          }`}
        >
          {siteSection.body}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <a
            href={appReady ? siteSection.appUrl : "#"}
            aria-disabled={!appReady}
            className={`border border-accent bg-accent px-8 py-3 text-[13px] uppercase tracking-[0.22em] text-room-panel transition-colors duration-200 ease-out hover:bg-accent-soft hover:border-accent-soft ${
              appReady ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            {siteSection.appLabel}
          </a>
          <a
            href={siteSection.contactHref}
            className="border border-accent px-8 py-3 text-[13px] uppercase tracking-[0.22em] text-accent transition-colors duration-200 ease-out hover:bg-accent hover:text-room-panel"
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
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-room-line/70 px-6 py-10"
      >
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="text-[12px] uppercase tracking-[0.22em] text-room-muted transition-colors duration-200 ease-out hover:text-accent"
          >
            {section.label}
          </Link>
        ))}
      </nav>

      <p className="pb-8 text-center text-[11px] text-room-faint">{legal}</p>
    </section>
  );
}
