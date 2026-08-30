"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Clozet, and the two things that hang off it.
 *
 * These were three entries in the menu, level with Accessories and Colognes,
 * which read as three products. They aren't. Building a clozet is the thing;
 * the tools are what you use between builds, and saved is where the builds go.
 * A menu that lists them flat asks somebody to work out that relationship for
 * themselves, and most people won't — they'll pick the first one and never
 * find the other two.
 *
 * A strip of tabs says it instead: one section, three places inside it, and
 * you can see the other two from wherever you are.
 *
 * Real routes rather than client-side tab state. A tab you can't link to, can't
 * open in a new window and can't reach with the back button is a worse version
 * of a page, and `/closet/tools` costs nothing over `/tools` — closet codes are
 * six uppercase characters, so no code can ever collide with these names.
 */
const TABS = [
  { href: "/closet", label: "Build" },
  { href: "/closet/tools", label: "Tools" },
  { href: "/closet/saved", label: "Saved" },
] as const;

export default function ClosetTabs() {
  const pathname = usePathname();

  /*
   * `/closet` is the Build tab only when it is exactly that.
   *
   * A `startsWith` here would light up Build on every subsection, since they
   * all begin with `/closet`. The shared-closet route `/closet/ABC123` is
   * deliberately not any of these tabs: someone arriving on a link to another
   * person's clozet is not inside their own section, and highlighting one of
   * these would tell them they are.
   */
  const current = TABS.find((tab) => tab.href === pathname)?.href;

  return (
    <nav aria-label="Clozet" className="mb-10 border-b border-room-line">
      <ul className="-mb-px flex items-end gap-7">
        {TABS.map((tab) => {
          const here = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={here ? "page" : undefined}
                /* The underline is the border, sitting on the strip's own rule
                   via the -mb-px above, so switching tabs moves a line rather
                   than adding one and shifting everything down a pixel. */
                className={`block border-b-2 pb-3 text-[14px] font-semibold transition-colors ${
                  here
                    ? "border-accent text-room-ink"
                    : "border-transparent text-room-muted hover:text-room-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
