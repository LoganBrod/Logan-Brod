import { company, isTodo, legal, siteSection } from "@/lib/copy";

/**
 * After the cinema, the actual website: who this is, and the door to the real
 * Closet app. Plain document flow — nothing here is scroll-driven.
 */
export default function SiteSection() {
  const appReady = !isTodo(siteSection.appUrl);

  return (
    <section aria-label={company} className="relative w-full border-t border-room-line bg-room-panel lg:pl-52">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-28 text-center">
        <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{company}</span>

        <h2
          data-cursor-target="text"
          className={`font-serif text-room-ink [font-size:clamp(2rem,4vw,3.5rem)] leading-tight ${
            isTodo(siteSection.heading) ? "opacity-40" : ""
          }`}
        >
          {siteSection.heading}
        </h2>

        <p
          data-cursor-target="text"
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
            data-cursor-target="bag"
            className={`border border-accent bg-accent px-8 py-3 text-[13px] uppercase tracking-[0.22em] text-room-panel transition-colors duration-200 ease-out hover:bg-accent-soft hover:border-accent-soft ${
              appReady ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            {siteSection.appLabel}
          </a>
          <a
            href={siteSection.contactHref}
            data-cursor-target="bag"
            className="border border-accent px-8 py-3 text-[13px] uppercase tracking-[0.22em] text-accent transition-colors duration-200 ease-out hover:bg-accent hover:text-room-panel"
          >
            {siteSection.contactLabel}
          </a>
        </div>
      </div>

      <p className="pb-8 text-center text-[11px] text-room-faint">{legal}</p>
    </section>
  );
}
