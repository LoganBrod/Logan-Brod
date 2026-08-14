"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { company, siteSection } from "@/lib/copy";

/**
 * The one piece of chrome both halves share.
 *
 * It used to be a permanent rail down the left, which cost 13rem of every page
 * and made the marketing walk feel like it was playing inside a frame. Now it's
 * a button that opens a panel: the pages get their full width back, and the
 * corridor gets to be the whole screen.
 *
 * The trade is that navigation is one click further away, so the button is
 * always in the same place, always legible against whatever is behind it, and
 * the panel closes on every exit a person might reach for — Escape, the
 * backdrop, the close button, or simply arriving somewhere new.
 */
const LINKS = [
  { href: "/", label: "About" },
  { href: "/closet", label: "Clozet" },
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/sizing", label: "Sizing" },
  { href: "/scan", label: "Scan" },
  { href: "/discover", label: "Discover" },
  { href: "/closets", label: "Saved" },
] as const;

export default function SideNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /** `/closet/abc123` is still the Clozet section; `/` must match exactly. */
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Arriving somewhere new closes the menu. Without this, a link tap on a phone
  // leaves the panel sitting over the page you just asked for.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        // Send focus back where it came from, or it lands on <body>.
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    // The first link, so a keyboard user is inside the menu rather than behind it.
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    // The page behind must not scroll while a full-screen panel is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-room-line/80 bg-room-panel/90 shadow-[0_2px_10px_rgba(27,26,23,0.08)] backdrop-blur transition-colors duration-200 hover:border-room-ink/25 sm:left-6 sm:top-6"
      >
        {/* Three rules that fold into a cross. Drawn rather than an icon font so
            the transition is a transform, not a swap. */}
        <span aria-hidden className="relative block h-3.5 w-5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`absolute left-0 block h-px w-full bg-room-ink transition-all duration-300 ease-out ${
                i === 0 ? (open ? "top-1/2 rotate-45" : "top-0") : ""
              } ${i === 1 ? (open ? "top-1/2 opacity-0" : "top-1/2 -translate-y-1/2") : ""} ${
                i === 2 ? (open ? "top-1/2 -rotate-45" : "top-full -translate-y-px") : ""
              }`}
            />
          ))}
        </span>
      </button>

      {/* Kept mounted so the panel can animate out; `invisible` keeps it off the
          tab order and out of the accessibility tree while closed. */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ease-out ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full cursor-default bg-room-ink/25 backdrop-blur-[2px]"
        />

        <nav
          id="site-menu"
          ref={panelRef}
          aria-label="Site"
          className={`absolute inset-y-0 left-0 flex w-full max-w-[19rem] flex-col border-r border-room-line bg-room-bg px-8 pb-10 pt-24 shadow-[8px_0_40px_rgba(27,26,23,0.12)] transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Link
            href="/"
            className="mb-10 text-[15px] font-bold uppercase tracking-[0.2em] text-room-ink transition-colors duration-200 hover:text-accent"
          >
            {company}
          </Link>

          <ul className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const current = isCurrent(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={`group relative flex items-center py-2.5 text-[13px] uppercase tracking-[0.22em] transition-colors duration-200 ease-out ${
                      current ? "text-accent" : "text-room-muted hover:text-room-ink"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mr-3 block h-px bg-accent transition-all duration-300 ease-out ${
                        current ? "w-5 opacity-100" : "w-0 opacity-0 group-hover:w-3 group-hover:opacity-60"
                      }`}
                    />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <a
            href={siteSection.contactHref}
            className="mt-auto pt-8 text-[12px] uppercase tracking-[0.22em] text-room-faint transition-colors duration-200 ease-out hover:text-accent"
          >
            {siteSection.contactLabel}
          </a>
        </nav>
      </div>
    </>
  );
}
