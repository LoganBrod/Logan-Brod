import { NextResponse } from "next/server";
import { listProposals, listListings, getLastResearchAt } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proposals joined to the listings they refer to, newest first. */
export async function GET() {
  const [proposals, listings, lastResearchAt] = await Promise.all([
    listProposals(),
    listListings(),
    getLastResearchAt(),
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
