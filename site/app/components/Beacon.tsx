"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackView } from "@/lib/analyticsEvents";

/**
 * One pageview per page, including the ones the router navigates to.
 *
 * Next's App Router changes pages without reloading the document, so a script
 * that fires on load counts the first page of a visit and nothing after it.
 * Watching `usePathname` is what makes a soft navigation a pageview.
 *
 * Where somebody came from is sent only with the first view of a visit, and
 * that is a correctness point rather than a saving: `document.referrer`
 * survives a soft navigation, so sending it every time would count one arrival
 * from TikTok once per page they then looked at.
 *
 * Mounted in the root layout, so it covers the marketing side and the product
 * alike — the whole question being how many of the first become the second.
 */
export default function Beacon() {
  const pathname = usePathname();
  const entry = useRef(true);

  useEffect(() => {
    if (!pathname) return;

    if (!entry.current) {
      trackView(pathname, {});
      return;
    }
    entry.current = false;

    // `?c=` tags a link so one video can be told from the next. Read once, on
    // the way in, and never stored in the address afterwards.
    let campaign: string | undefined;
    try {
      const params = new URLSearchParams(window.location.search);
      campaign = params.get("c") ?? params.get("utm_campaign") ?? undefined;
    } catch {
      campaign = undefined;
    }

    trackView(pathname, { ref: document.referrer, campaign });
  }, [pathname]);

  return null;
}
