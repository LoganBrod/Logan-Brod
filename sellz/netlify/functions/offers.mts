import type { Config } from "@netlify/functions";

/**
 * Checks for pending eBay Best Offers and auto-accepts anything at or above
 * the seller's threshold. The endpoint itself checks autoAcceptOfferPct and
 * does nothing when it's 0 (the default), so this firing on a schedule is
 * safe regardless of the setting — same pattern as relist.mts.
 */
export default async () => {
  const base = process.env.PUBLIC_SITE_URL || process.env.URL;
  if (!base) {
    return new Response("No site URL available", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/offers`, {
    method: "POST",
    headers: process.env.CRON_SECRET
      ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  const body = await res.text();
  return new Response(body, { status: res.status });
};

export const config: Config = {
  // eBay expires an unanswered Best Offer after 48 hours, so every 30
  // minutes catches everything with room to spare without hammering the API.
  schedule: "*/30 * * * *",
};
