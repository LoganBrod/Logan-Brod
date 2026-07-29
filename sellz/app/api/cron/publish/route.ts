import { NextRequest, NextResponse } from "next/server";
import { listListings, updateListing } from "@/lib/store";
import { publishListing } from "@/lib/publishListing";
import { cronAuthorized, tenantsWithEbay } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Publishes listings whose scheduled time has arrived, across every tenant.
 *
 * The actual publish is delegated to lib/publishListing so this and the
 * interactive "Approve & list" path cannot drift apart — they previously had
 * two separate copies of the same eBay call, and only one of them knew about
 * the shipping-weight requirement.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin =
    process.env.PUBLIC_SITE_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN_URL ||
    req.nextUrl.origin;

  const now = Date.now();
  const results: { userId: string; listingId: string; ok: boolean; error?: string }[] = [];

  for (const userId of await tenantsWithEbay()) {
    let due;
    try {
      due = (await listListings(userId)).filter(
        (l) =>
          l.status === "scheduled" &&
          l.scheduledPublishAt &&
          Date.parse(l.scheduledPublishAt) <= now
      );
    } catch {
      continue;
    }

    for (const listing of due) {
      const outcome = await publishListing(userId, listing.id, origin);
      if (outcome.ok) {
        // Clear the schedule so the listing cannot be picked up again on the
        // next pass. The store maps a present-but-undefined key to an explicit
        // null for exactly this case.
        await updateListing(userId, listing.id, { scheduledPublishAt: undefined });
      }
      results.push({
        userId,
        listingId: listing.id,
        ok: outcome.ok,
        error: outcome.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
