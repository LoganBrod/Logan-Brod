"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/new", label: "New listing", icon: CameraIcon },
  { href: "/dashboard", label: "Dashboard", icon: ChartIcon },
  { href: "/analytics", label: "Analytics", icon: ProfitIcon },
  { href: "/listings", label: "Listings", icon: TagIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/generate", label: "Write from text", icon: SparkIcon },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
          >
            {active && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl bg-brand/10 shadow-glow"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {active && (
              <motion.span
                layoutId="sidebar-active-bar"
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={
                "relative z-10 transition-colors " +
                (active ? "text-brand" : "text-fog/50 group-hover:text-fog/80")
              }
            >
              <item.icon />
            </span>
            <span
              className={
                "relative z-10 transition-colors " +
                (active ? "text-fog" : "text-fog/60 group-hover:text-fog/90")
              }
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-ink-border/60 bg-ink-deep/95 backdrop-blur sm:flex">
        <Link href="/" className="group flex items-center gap-2 px-6 py-6">
          <span className="text-2xl font-extrabold tracking-tight text-fog">
            Levo<span className="text-brand">Z</span>
          </span>
        </Link>
        <NavLinks pathname={pathname} />
        <div className="space-y-3 border-t border-ink-border/60 px-6 py-4">
          <ThemeToggle />
          <p className="text-[11px] leading-relaxed text-fog/30">Listings that learn what sells.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-border/60 bg-ink-deep/95 px-4 py-3 backdrop-blur sm:hidden">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-fog">
          Levo<span className="text-brand">Z</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-border text-fog/70"
          >
            <MenuIcon />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 bg-black/50 sm:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-ink-border bg-ink-deep px-0 pb-4 sm:hidden"
            >
              <div className="flex items-center justify-between px-6 py-6">
                <span className="text-2xl font-extrabold tracking-tight text-fog">
                  Levo<span className="text-brand">Z</span>
                </span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-border text-fog/60"
                >
                  <CloseIcon />
                </button>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
              <div className="space-y-3 border-t border-ink-border/60 px-6 pt-4">
                <ThemeToggle />
                <p className="text-[11px] leading-relaxed text-fog/30">Listings that learn what sells.</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
function ProfitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="14" rx="2" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8 6l1.5-2h5L16 6" strokeLinejoin="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5v.6A3 3 0 0 0 5 10v1a3 3 0 0 0 1 2.24V15a3 3 0 0 0 3 3v0a2 2 0 0 0 2-2V6.5A2.5 2.5 0 0 0 9.5 4Z"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4A2.5 2.5 0 0 1 17 6.5v.6A3 3 0 0 1 19 10v1a3 3 0 0 1-1 2.24V15a3 3 0 0 1-3 3v0a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 14.5 4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v5c0 .4.16.78.44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l5-5a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.5 4Z"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
