"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";

interface NavChild {
  href: string;
  label: string;
  desc: string;
}
interface NavItem {
  label: string;
  href?: string;
  children?: NavChild[];
}

const NAV: NavItem[] = [
  {
    label: "Sell",
    children: [
      { href: "/new", label: "New listing", desc: "Photograph an item and get a finished listing" },
      { href: "/generate", label: "Write from text", desc: "Describe the item instead of shooting it" },
      { href: "/listings", label: "All listings", desc: "Grades, comps, costs, and what is stuck" },
    ],
  },
  {
    label: "Insights",
    children: [
      { href: "/dashboard", label: "Dashboard", desc: "Sold, revenue, sell-through, recent activity" },
      { href: "/analytics", label: "Profit and margins", desc: "What each item made and which sources pay off" },
    ],
  },
  { label: "Brain", href: "/brain" },
];

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Close menus on navigation, on Escape, and on any click outside the bar.
  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    }
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <div className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        ref={navRef}
        className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-ink-border/70 bg-ink-card/80 px-3 py-2 shadow-card backdrop-blur-xl sm:px-4"
      >
        <Link href="/" className="shrink-0 px-2 text-lg font-extrabold tracking-tight text-fog">
          Levo<span className="text-brand">Z</span>
        </Link>

        {/* Desktop menu, centred between the logo and the actions */}
        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label} className="relative">
                <button
                  onClick={() => setOpen(open === item.label ? null : item.label)}
                  onMouseEnter={() => setOpen(item.label)}
                  aria-expanded={open === item.label}
                  className={
                    "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
                    (item.children.some((c) => pathname.startsWith(c.href))
                      ? "text-fog"
                      : "text-fog/60 hover:text-fog")
                  }
                >
                  {item.label}
                  <Chevron open={open === item.label} />
                </button>

                <AnimatePresence>
                  {open === item.label && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                      onMouseLeave={() => setOpen(null)}
                      className="absolute left-0 top-full w-80 pt-3"
                    >
                      <div className="overflow-hidden rounded-2xl border border-ink-border bg-ink-card p-2 shadow-card">
                        {item.children.map((c) => (
                          <Link
                            key={c.href}
                            href={c.href}
                            className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-deep"
                          >
                            <span className="block text-sm font-semibold text-fog">{c.label}</span>
                            <span className="mt-0.5 block text-xs leading-snug text-fog/50">
                              {c.desc}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href!}
                className={
                  "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
                  (pathname.startsWith(item.href!) ? "text-fog" : "text-fog/60 hover:text-fog")
                }
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            href="/new"
            className="hidden rounded-full bg-brand px-4 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim sm:block"
          >
            Start a listing
          </Link>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-border text-fog/70 md:hidden"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-3xl border border-ink-border bg-ink-card p-3 shadow-card md:hidden"
          >
            {NAV.map((item) => (
              <div key={item.label} className="py-1">
                {item.children ? (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-fog/40">
                      {item.label}
                    </p>
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={item.href!}
                    className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
            <Link
              href="/new"
              className="mt-2 block rounded-full bg-brand py-2.5 text-center text-sm font-bold text-ink"
            >
              Start a listing
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className={"transition-transform duration-200 " + (open ? "rotate-180" : "")}
    >
      <path d="M5 8.5 12 15.5l7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
