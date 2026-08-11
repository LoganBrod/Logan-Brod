import { company, siteSection } from "@/lib/copy";

/**
 * A slim wordmark bar over the page. The one place navigation lives; the
 * frame below carries everything else.
 */
export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4 lg:px-10">
      <span className="font-serif text-lg tracking-wide text-room-ink">{company}</span>
      <a
        href={siteSection.contactHref}
        data-cursor-target="bag"
        className="text-[12px] uppercase tracking-[0.22em] text-room-muted transition-colors duration-200 ease-out hover:text-accent"
      >
        {siteSection.contactLabel}
      </a>
    </header>
  );
}
