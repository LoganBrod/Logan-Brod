import Link from "next/link";
import { hero } from "@/lib/copy";
import { Wordmark } from "./Logo";

/**
 * The header the marketing page was missing.
 *
 * A front door with one line and one button read as unfinished - not because
 * anything was absent, but because every site a visitor has ever trusted puts
 * a name, a way in and a way to start along the top. This is that band and
 * nothing more: no dropdowns, no mega-menu, no search. Three links from the
 * width where they fit, and the two things a person arrives wanting - to sign
 * in, or to begin.
 *
 * It sits in the document rather than over it. Sticky would put a 64px band
 * across the top of the corridor walk further down, which is pinned to the
 * full height of the screen and drawn inside a frame inset from its edges.
 *
 * Its own surface colour, a shade off the page's, because a header that
 * shares the page's background is a row of links rather than a bar.
 */
const LINKS = [
  { href: "/closet", label: "Clozet" },
  { href: "/accessories", label: "Accessories" },
  { href: "/colognes", label: "Colognes" },
] as const;

export default function TopBar() {
  return (
    <header className="w-full border-b border-room-line bg-room-panel">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:h-[4.5rem] sm:gap-6 sm:px-8">
        <Link href="/" aria-label="LevoZ Labs, home" className="shrink-0">
          <Wordmark />
        </Link>

        {/* Below md the right-hand pair takes the room these would need, and a
            wrapped nav row inside a fixed-height bar is worse than no nav row:
            the footer lists the same three. */}
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] text-room-muted transition-colors duration-200 ease-out hover:text-room-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-5">
          {/* Lands on the product with its sign-in form already open, rather
              than on a page where the way in is a button somebody has to find. */}
          <Link
            href="/closet?signin=1"
            className="text-[12px] font-semibold text-room-muted transition-colors duration-200 ease-out hover:text-room-ink sm:text-[13px]"
          >
            Log in
          </Link>
          <Link href={hero.href} className="btn-primary px-4 text-[11px] sm:px-6 sm:text-[12px]">
            {hero.cta}
          </Link>
        </div>
      </div>
    </header>
  );
}
