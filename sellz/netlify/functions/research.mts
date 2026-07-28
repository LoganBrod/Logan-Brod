import type { Config } from "@netlify/functions";

/**
 * Nightly background research pass. Calls the app's own /api/research route,
 * which re-comps every live listing and files proposals for the seller to
 * approve. Nothing is pushed to eBay from here.
 */
export default async () => {
  const base = process.env.PUBLIC_SITE_URL || process.env.URL;
  if (!base) {
    return new Response("No site URL available", { status: 500 });
  }
  const res = await fetch(`${base}/api/research`, {
    method: "POST",
    headers: process.env.RESEARCH_SECRET
      ? { "x-research-secret": process.env.RESEARCH_SECRET }
      : {},
  });
  const body = await res.text();
  return new Response(body, { status: res.status });
};

export const config: Config = {
  // Once a day, early morning UTC. Listings need a day of traffic before
  // there is anything meaningful to conclude, so more often adds noise.
  schedule: "0 6 * * *",
};
