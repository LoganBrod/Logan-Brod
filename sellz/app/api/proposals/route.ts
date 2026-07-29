import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { listProposals, listListings, getLastResearchAt } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proposals joined to the listings they refer to, newest first. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const [proposals, listings, lastResearchAt] = await Promise.all([
    listProposals(userId),
    listListings(userId),
    getLastResearchAt(userId),
  ]);
  const byId = new Map(listings.map((l) => [l.id, l]));

  return NextResponse.json(
    {
      lastResearchAt,
      proposals: proposals.map((p) => {
        const l = byId.get(p.listingId);
        return {
          ...p,
          listing: l
            ? {
                id: l.id,
                title: l.title,
                price: l.price,
                status: l.status,
                ebayItemId: l.ebayItemId,
                views: l.outcome?.views ?? 0,
                watchers: l.outcome?.watchers ?? 0,
                offers: l.outcome?.offers ?? 0,
              }
            : null,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
