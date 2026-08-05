import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, type DepopState } from "@/lib/store";
import { generateDepopDraft } from "@/lib/depop";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Rewrite this listing for Depop.
 *
 * Separate from the eBay draft rather than a formatting pass over it: the two
 * marketplaces rank on different signals, so the same item genuinely needs two
 * pieces of copy. See lib/depop.ts for what differs and why.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const draft = await generateDepopDraft(userId, listing);
    const depop: DepopState = {
      ...listing.depop,
      draft,
      generatedAt: new Date().toISOString(),
    };
    await updateListing(userId, listing.id, { depop });
    return NextResponse.json(await getListing(userId, listing.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not write the Depop version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Update the manual tracking state.
 *
 * Depop publishes no listing API, so this is the substitute: the seller tells
 * us what they did and we keep the record. Every field here is a claim by the
 * seller rather than something we observed, which is why nothing in this route
 * touches the generated draft.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const depop: DepopState = { ...listing.depop };
  const patch: Parameters<typeof updateListing>[2] = {};

  // Posting to Depop is the moment the clock starts: days-listed, the stale
  // sweep and the refresh nudge all measure from here.
  if (body.listed === true) {
    depop.listedAt = depop.listedAt ?? now;
    patch.status = listing.status === "draft" ? "active" : listing.status;
    patch.outcome = {
      views: listing.outcome?.views ?? 0,
      watchers: listing.outcome?.watchers ?? 0,
      offers: listing.outcome?.offers ?? 0,
      soldPrice: listing.outcome?.soldPrice,
      soldAt: listing.outcome?.soldAt,
      trafficHistory: listing.outcome?.trafficHistory,
      listedAt: listing.outcome?.listedAt ?? depop.listedAt,
      updatedAt: now,
    };
  }

  if (body.refreshed === true) depop.refreshedAt = now;

  if (typeof body.url === "string") {
    const url = body.url.trim();
    // Store a link or clear it, but never a string that isn't a Depop URL —
    // this is rendered as a link the seller clicks.
    if (!url) {
      depop.url = undefined;
    } else if (/^https?:\/\/(www\.)?depop\.com\//i.test(url)) {
      depop.url = url;
    } else {
      return NextResponse.json(
        { error: "That doesn't look like a depop.com link" },
        { status: 400 }
      );
    }
  }

  patch.depop = depop;
  await updateListing(userId, listing.id, patch);
  return NextResponse.json(await getListing(userId, listing.id));
}
