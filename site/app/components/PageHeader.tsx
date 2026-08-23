import Link from "next/link";
import AccountBar from "./AccountBar";

/**
 * The top of every page in the app, defined once.
 *
 * It was written out eight times, and drifted eight ways: one page carried two
 * explanatory paragraphs above the fold, another fifty-two words of subtext,
 * another none at all. Nobody decided that; it is what happens when a shape is
 * copied rather than shared.
 *
 * The rule it enforces is that a page opening is one moment, not a briefing.
 * A headline, one line of subtext, and the two things you might want to do. Any
 * further explanation belongs in a section below, where somebody who wants it
 * will find it and somebody who doesn't is not made to scroll past it.
 *
 * The right-hand column is deliberately not an explainer paragraph. A big
 * headline on the left with a small block of prose floating to its right is the
 * pattern to avoid; a column carrying sign-in and the primary action is a real
 * compositional reason for the split, and it keeps the page's one CTA at the
 * top where it can be reached.
 */
export default function PageHeader({
  title,
  lede,
  action,
}: {
  title: React.ReactNode;
  /**
   * One sentence. Twenty words is the ceiling, and it is a real one: past that
   * the headline stops being the thing you read first.
   */
  lede?: string;
  /** The page's primary action, when it has one that isn't on the page itself. */
  action?: { href: string; label: string };
}) {
  return (
    <header className="mb-12 flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
      <div className="max-w-[34rem]">
        {/*
          Capped at 2.9rem rather than the 2.75rem/4rem it was set at across
          different pages. Big enough to lead, small enough that a five-word
          title still lands on one line at desktop.
        */}
        <h1 className="display text-[2rem] text-room-ink sm:text-[2.6rem] md:text-[2.9rem]">
          {title}
        </h1>
        {lede && <p className="mt-5 text-[15px] leading-relaxed text-room-muted">{lede}</p>}
      </div>

      <div className="flex flex-col items-end gap-3">
        <AccountBar />
        {action && (
          <Link href={action.href} className="btn-ghost whitespace-nowrap">
            {action.label}
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * The paragraph that used to be crowded into the header.
 *
 * A quiet band directly under it: still the first thing after the opening, but
 * out of the moment the page leads with, and set at a width that is comfortable
 * to read rather than squeezed beside a headline.
 */
export function PageNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-12 border-l-2 border-room-line pl-5">
      <p className="max-w-[62ch] text-[14px] leading-relaxed text-room-muted">{children}</p>
    </div>
  );
}
