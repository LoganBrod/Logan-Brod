import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, type MarketplaceState } from "@/lib/store";
import { generateMarketplaceDraft } from "@/lib/marketplaceDraft";
import { MARKETPLACES, isMarketplaceId } from "@/lib/marketplaces";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One listing, one marketplace: write the draft, and record what the seller
 * did with it.
 *
 * Replaces the Depop-only route. None of these platforms publish a seller API,
 * so the shape is identical for all of them — which is exactly why it is one
 * route parameterised by marketplace rather than three near-copies.
 */

/** Read both drafts and tracking from the map, falling back to the old column. */
function stateFor(
  listing: { marketplaces?: Record<string, MarketplaceState>; depop?: MarketplaceState },
  mkt: string
): MarketplaceState {
  return listing.marketplaces?.[mkt] ?? (mkt === "depop" ? listing.depop ?? {} : {});
}

function merged(
  listing: { marketplaces?: Record<string, MarketplaceState>; depop?: MarketplaceState },
  mkt: string,
  next: MarketplaceState
): Record<string, MarketplaceState> {
  const base = listing.marketplaces ?? (listing.depop ? { depop: listing.depop } : {});
  return { ...base, [mkt]: next };
}

/** Write the marketplace-specific draft. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; mkt: string } }
) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  if (!isMarketplaceId(params.mkt)) {
    return NextResponse.json({ error: "Unknown marketplace" }, { status: 404 });
  }

  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const draft = await generateMarketplaceDraft(userId, listing, params.mkt);
    const next: MarketplaceState = {
      ...stateFor(listing, params.mkt),
      draft,
      generatedAt: new Date().toISOString(),
    };
    await updateListing(userId, listing.id, {
      marketplaces: merged(listing, params.mkt, next),
    });
    return NextResponse.json(await getListing(userId, listing.id));
  } catch (err) {
    const spec = MARKETPLACES[params.mkt];
    const message =
      err instanceof Error ? err.message : `Could not write the ${spec.name} version`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Update the manual tracking state.
 *
 * Every field here is a claim by the seller rather than something observed,
 * which is why nothing in this route touches the generated draft.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; mkt: string } }
) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  if (!isMarketplaceId(params.mkt)) {
    return NextResponse.json({ error: "Unknown marketplace" }, { status: 404 });
  }

  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const next: MarketplaceState = { ...stateFor(listing, params.mkt) };
  const patch: Parameters<typeof updateListing>[2] = {};

  // Posting is when the clock starts: days-listed and the freshness nudge both
  // measure from here.
  if (body.listed === true) {
    next.listedAt = next.listedAt ?? now;
    patch.status = listing.status === "draft" ? "active" : listing.status;
    patch.outcome = {
      views: listing.outcome?.views ?? 0,
      watchers: listing.outcome?.watchers ?? 0,
      offers: listing.outcome?.offers ?? 0,
      soldPrice: listing.outcome?.soldPrice,
      soldAt: listing.outcome?.soldAt,
      trafficHistory: listing.outcome?.trafficHistory,
      listedAt: listing.outcome?.listedAt ?? next.listedAt,
      updatedAt: now,
    };
  }

  if (body.refreshed === true) next.refreshedAt = now;

  if (typeof body.url === "string") {
    const url = body.url.trim();
    // Store a link or clear it, but never a string that isn't a link to this
    // marketplace — it is rendered as something the seller clicks.
    if (!url) {
      next.url = undefined;
    } else {
      const host = params.mkt === "depop" ? "depop" : params.mkt;
      const pattern = new RegExp(`^https?://(www\\.)?${host}\\.com/`, "i");
      if (!pattern.test(url)) {
        return NextResponse.json(
          { error: `That doesn't look like a ${MARKETPLACES[params.mkt].name} link` },
          { status: 400 }
        );
      }
      next.url = url;
    }
  }

  patch.marketplaces = merged(listing, params.mkt, next);
  await updateListing(userId, listing.id, patch);
  return NextResponse.json(await getListing(userId, listing.id));
}
