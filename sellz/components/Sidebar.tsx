"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const NAV = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/generate", label: "Generate", icon: SparkIcon },
  { href: "/listings", label: "Listings", icon: TagIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-ink-border/60 bg-ink-deep/95 backdrop-blur">
      <Link href="/" className="group flex items-center gap-2 px-6 py-6">
        <span className="text-2xl font-extrabold tracking-tight text-fog">
          Levo<span className="text-brand">Z</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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
      <div className="border-t border-ink-border/60 px-6 py-4 text-[11px] leading-relaxed text-fog/30">
        Listings that learn what sells.
      </div>
    </aside>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
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
