import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";

/** Record traffic + sale outcome for a listing. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const d = (v: unknown) =>
    typeof v === "string" && isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined;

  const now = new Date().toISOString();
  const views = n(body.views);
  // Depop calls them likes, eBay calls them watchers. Same signal — someone
  // saved the item without buying it — so it lands in the same field and gets
  // relabelled per platform in the UI.
  const watchers = n(body.likes ?? body.watchers);

  /**
   * Keep the reading rather than only the latest number.
   *
   * The proposal engine reads trafficHistory to tell a listing that's dying
   * in search from one that's simply young. Without this the route overwrote
   * `outcome` wholesale on every save and silently discarded the history that
   * eBay syncs had built up — and on Depop, where the seller typing these
   * numbers in IS the only source, there would be no history at all.
   */
  const history = [...(listing.outcome?.trafficHistory ?? [])];
  const last = history[history.length - 1];
  if (!last || last.views !== views || last.watchers !== watchers) {
    history.push({ views, watchers, at: now });
  }

  await updateListing(userId, listing.id, {
    outcome: {
      views,
      watchers,
      offers: n(body.offers),
      soldPrice: isFinite(Number(body.soldPrice)) && Number(body.soldPrice) > 0
        ? Number(body.soldPrice)
        : undefined,
      listedAt: d(body.listedAt) ?? listing.outcome?.listedAt,
      soldAt: d(body.soldAt) ?? listing.outcome?.soldAt,
      // Cap the history so a seller updating numbers daily for a year can't
      // grow one row without bound.
      trafficHistory: history.slice(-60),
      updatedAt: now,
    },
  });
  return NextResponse.json(await getListing(userId, listing.id));
}
