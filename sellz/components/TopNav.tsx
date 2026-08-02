"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
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
      { href: "/new", label: "Sell something", desc: "Take a photo and get a finished listing" },
      { href: "/generate", label: "Write from text", desc: "Describe it instead of photographing it" },
      { href: "/listings", label: "Your stuff", desc: "Everything you've listed, and what's not moving" },
    ],
  },
  {
    label: "Money",
    children: [
      { href: "/dashboard", label: "Dashboard", desc: "What's sold, what it made, what's happening" },
      { href: "/analytics", label: "What you made", desc: "Profit per item, and which finds were worth it" },
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
    // Edge to edge and flush with the top: the inset padding made the bar a
    // floating island with the page visibly sliding under its corners.
    <div className="sticky top-0 z-40 bg-ink">
      <div
        ref={navRef}
        className="mx-auto flex max-w-6xl items-center gap-3 border-b border-ink-border bg-ink px-4 py-3"
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
                    "flex items-center gap-1 px-3 py-1.5 text-sm font-semibold transition-colors " +
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
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                      onMouseLeave={() => setOpen(null)}
                      className="absolute left-0 top-full w-80"
                    >
                      <div className="border border-ink-border bg-ink-card p-1.5">
                        {item.children.map((c) => (
                          <Link
                            key={c.href}
                            href={c.href}
                            className="block px-3 py-2.5 transition-colors hover:bg-ink-deep"
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
                  "px-3 py-1.5 text-sm font-semibold transition-colors " +
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
            className="hidden bg-brand px-4 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim sm:block"
          >
            Start a listing
          </Link>
          <AccountMenu />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center border border-ink-border text-fog/70 md:hidden"
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
            className="mx-auto max-w-6xl overflow-hidden border-b border-ink-border bg-ink-card p-2 md:hidden"
          >
            {NAV.map((item) => (
              <div key={item.label} className="py-1">
                {item.children ? (
                  <>
                    <p className="px-3 pb-1 pt-2 text-xs font-semibold text-fog/55">
                      {item.label}
                    </p>
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className="block px-3 py-2.5 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={item.href!}
                    className="block px-3 py-2.5 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
            <Link
              href="/new"
              className="mt-2 block bg-brand py-2.5 text-center text-sm font-bold text-ink"
            >
              Start a listing
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Account control. Renders a "Sign in" link when there's no session, and the
 * user's initial with a small menu when there is. Kept in this file because it
 * shares the bar's open/close behaviour and nothing else uses it.
 */
function AccountMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Render nothing at all while the session resolves, rather than flashing
  // "Sign in" at someone who is already signed in.
  if (status === "loading") return <span className="h-9 w-9" />;

  if (status !== "authenticated") {
    return (
      <Link
        href="/login"
        className="border border-ink-border px-3 py-2 text-sm font-semibold text-fog/80 transition hover:border-brand/50 hover:text-fog"
      >
        Sign in
      </Link>
    );
  }

  const user = session.user;
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center border border-ink-border bg-ink-card text-sm font-bold text-fog transition hover:border-brand/50"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-50 mt-1 w-56 border border-ink-border bg-ink-card p-1.5"
          >
            <div className="border-b border-ink-border px-3 py-2">
              <p className="truncate text-sm font-semibold text-fog">
                {user?.name || user?.email}
              </p>
              <p className="mt-0.5 text-xs capitalize text-brand">{user?.plan ?? "free"} plan</p>
            </div>
            <Link
              href="/brain"
              className="block px-3 py-2 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
            >
              Settings
            </Link>
            <Link
              href="/settings/billing"
              className="block px-3 py-2 text-sm font-semibold text-fog transition-colors hover:bg-ink-deep"
            >
              Billing
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="block w-full px-3 py-2 text-left text-sm font-semibold text-fog/60 transition-colors hover:bg-ink-deep hover:text-fog"
            >
              Sign out
            </button>
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
