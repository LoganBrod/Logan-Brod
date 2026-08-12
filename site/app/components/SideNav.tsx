"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { company, siteSection } from "@/lib/copy";

/**
 * The one piece of chrome both halves share, and what makes them read as one
 * place: a rail down the left on desktop, a bar across the top on phones.
 *
 * Kept deliberately quiet — a wordmark, three destinations, and a way to write
 * in. The marketing page is a film playing inside a frame; the rail should
 * never compete with it.
 */
const LINKS = [
  { href: "/", label: "About" },
  { href: "/closet", label: "Closet" },
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/sizing", label: "Sizing" },
  { href: "/scan", label: "Scan" },
  { href: "/discover", label: "Discover" },
  { href: "/closets", label: "Saved" },
] as const;

export default function SideNav() {
  const pathname = usePathname();

  /** `/closet/abc123` is still the Closet section; `/` must match exactly. */
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Site"
      className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-4 border-b border-room-line/70 bg-room-bg/85 px-5 backdrop-blur lg:inset-y-0 lg:right-auto lg:h-auto lg:w-52 lg:flex-col lg:items-start lg:gap-0 lg:border-b-0 lg:border-r lg:px-8 lg:py-9"
    >
      <Link
        href="/"
        data-cursor-target="bag"
        className="shrink-0 whitespace-nowrap font-serif text-base tracking-wide text-room-ink transition-colors duration-200 ease-out hover:text-accent lg:mb-14 lg:text-lg"
      >
        {company}
      </Link>

      {/* Seven destinations don't fit a phone bar, so it scrolls sideways there
          and becomes an ordinary column on the rail. `-mx-1 px-1` keeps the
          focus ring on the first and last link from being clipped by the
          scroll container. */}
      <ul className="-mx-1 flex flex-1 items-center gap-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-none lg:flex-col lg:items-start lg:gap-5 lg:overflow-visible lg:px-0">
        {LINKS.map((link) => {
          const current = isCurrent(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                data-cursor-target="bag"
                className={`relative whitespace-nowrap text-[11px] uppercase tracking-[0.14em] transition-colors duration-200 ease-out lg:text-[12px] lg:tracking-[0.22em] ${
                  current ? "text-accent" : "text-room-muted hover:text-room-ink"
                }`}
              >
                {/* A hairline that marks where you are, on the rail only. */}
                <span
                  aria-hidden
                  className={`absolute -left-4 top-1/2 hidden h-px w-2.5 -translate-y-1/2 bg-accent transition-opacity duration-200 lg:block ${
                    current ? "opacity-100" : "opacity-0"
                  }`}
                />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* No room for this beside three links on a phone; the About page and the
          product's own header both carry a way to write in. */}
      <a
        href={siteSection.contactHref}
        data-cursor-target="bag"
        className="hidden text-[12px] uppercase tracking-[0.22em] text-room-muted transition-colors duration-200 ease-out hover:text-accent lg:mt-auto lg:block"
      >
        {siteSection.contactLabel}
      </a>
    </nav>
  );
}
