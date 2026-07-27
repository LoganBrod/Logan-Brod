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
  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  );
}
