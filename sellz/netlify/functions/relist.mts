import type { Config } from "@netlify/functions";

/**
 * Daily relist-cadence check. Calls the app's own /api/cron/relist, which
 * finds active listings past their relist cadence and republishes them at a
 * Brain-optimized price.
 *
 * Nothing called this before — the "Cycle stale listings on a schedule"
 * toggle in Settings existed and the endpoint it depends on worked, but
 * nothing ever triggered it, so turning the toggle on had no effect at all.
 * The endpoint itself still checks relistEnabled and does nothing when it's
 * off, so this firing daily is safe regardless of the setting.
 */
export default async () => {
  const base = process.env.PUBLIC_SITE_URL || process.env.URL;
  if (!base) {
    return new Response("No site URL available", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/relist`, {
    method: "POST",
    headers: process.env.CRON_SECRET
      ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  const body = await res.text();
  return new Response(body, { status: res.status });
};

export const config: Config = {
  // After the research pass has had a chance to file same-day proposals.
  schedule: "0 8 * * *",
};
