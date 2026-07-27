"use client";

import { usePathname } from "next/navigation";

/**
 * Fades each route in on navigation.
 *
 * This wraps every page, so it must never be able to leave content hidden.
 * A JS-driven `initial={{ opacity: 0 }}` did exactly that: if hydration was
 * slow or scripts failed, the whole app rendered blank. The animation is CSS
 * instead, and the pathname key remounts the node so it replays per route.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The landing page runs full bleed so its sections can span the viewport.
  // Every app route gets the standard reading container.
  const fullBleed = pathname === "/";
  return (
    <div
      key={pathname}
      className={
        fullBleed ? "animate-rise" : "animate-rise mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
      }
    >
      {children}
    </div>
  );
}
