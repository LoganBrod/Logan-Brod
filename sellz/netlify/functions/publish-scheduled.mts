import type { Config } from "@netlify/functions";

/**
 * Publishes listings the seller scheduled for a future time. Calls the
 * app's own /api/cron/publish, which finds listings with status
 * "scheduled" whose time has passed and publishes them to eBay.
 *
 * Like the relist cron, this endpoint existed and worked but nothing ever
 * called it — "Schedule for later" would save a time and then just sit
 * there forever, since nothing was checking whether it had arrived.
 */
export default async () => {
  const base = process.env.PUBLIC_SITE_URL || process.env.URL;
  if (!base) {
    return new Response("No site URL available", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/publish`, {
    method: "POST",
    headers: process.env.CRON_SECRET
      ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  const body = await res.text();
  return new Response(body, { status: res.status });
};

export const config: Config = {
  // Every 15 minutes, matching the granularity a seller picks a time at.
  schedule: "*/15 * * * *",
};
