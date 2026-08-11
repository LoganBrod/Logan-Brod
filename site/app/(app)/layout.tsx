import Link from "next/link";
import { company } from "@/lib/copy";

/**
 * The product's shell. A wordmark that leads back out to the site, and
 * nothing else — the pages below carry their own headers, and this is a tool
 * people came here to use rather than a page to be sold on.
 *
 * None of the marketing layer (smooth scroll, custom cursor, the frame
 * sequence) is mounted here; that lives in the (marketing) group.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center px-6 pt-8">
        <Link
          href="/"
          className="font-serif text-lg tracking-wide text-room-ink transition-colors duration-200 ease-out hover:text-accent"
        >
          {company}
        </Link>
      </div>
      {children}
    </>
  );
}
