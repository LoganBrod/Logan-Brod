import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getEbayTokens,
  listListings,
  listProposals,
  setLastResearchAt,
  upsertProposal,
  type Listing,
  type Proposal,
} from "@/lib/store";
import { researchEbayComps } from "@/lib/ebay";
import { proposeListingChange } from "@/lib/brain";
import { getPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Days a listing has been live, or null when we do not know. */
function daysLive(l: Listing): number | null {
  const start = l.outcome?.listedAt ?? l.publishedAt ?? l.createdAt;
  const t = Date.parse(start);
  if (!isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

/**
 * The background pass. Walks live listings that have been up long enough to
 * have said something, re-researches comps against the current market, and
 * files a proposal for each. Nothing here touches eBay; proposals only
 * become changes when the seller approves one.
 */
export async function POST(req: NextRequest) {
  // A shared secret lets the scheduled job call this without a session,
  // while keeping it from being triggered by anyone who finds the URL.
  const secret = process.env.RESEARCH_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-research-secret") ?? req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }

  if (!(await getEbayTokens())) {
    return NextResponse.json({ error: "Connect your eBay account first" }, { status: 400 });
  }

  const all = await listListings();
  const pending = await listProposals();
  const pendingFor = new Set(
    pending.filter((p) => p.status === "pending").map((p) => p.listingId)
  );

  // Only listings that are actually live, have been up at least a day so
  // there is signal to read, and are not already awaiting a decision.
  const candidates = all
    .filter((l) => l.status === "active" && l.ebayItemId)
    .filter((l) => {
      const d = daysLive(l);
      return d !== null && d >= 1;
    })
    .filter((l) => !pendingFor.has(l.id))
    .slice(0, 15);

  const results: { listingId: string; kind: string }[] = [];

  for (const listing of candidates) {
    try {
      // Re-comp against the market as it is now, using the item photo when
      // we have one so matches come from the picture.
      let base64: string | undefined;
      if (listing.photos?.length) {
        const photo = await getPhoto(listing.photos[0]);
        base64 = photo?.data.toString("base64");
      }
      const comps = await researchEbayComps(listing.title, base64).catch(() => null);

      const compsContext = comps
        ? [
            comps.comps
              .slice(0, 10)
              .map((c) => `- ${c.sold ? "SOLD" : "asking"} $${c.price}: ${c.title.slice(0, 70)}`)
              .join("\n"),
            comps.note,
            comps.suggestedPrice ? `Median of those: $${comps.suggestedPrice}.` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      const draft = await proposeListingChange(listing.id, compsContext, daysLive(listing) ?? 0);
      if (!draft || draft.kind === "hold") {
        results.push({ listingId: listing.id, kind: draft?.kind ?? "none" });
        continue;
      }

      const proposal: Proposal = {
        id: crypto.randomUUID().slice(0, 8),
        listingId: listing.id,
        kind: draft.kind,
        summary: draft.summary,
        rationale: draft.rationale,
        currentPrice: listing.price,
        proposedPrice:
          draft.kind === "reprice" && draft.proposedPrice > 0 ? draft.proposedPrice : undefined,
        currentTitle: listing.title,
        proposedTitle: draft.proposedTitle?.trim() || undefined,
        proposedDescription: draft.proposedDescription?.trim() || undefined,
        confidence: Math.max(0, Math.min(100, Math.round(draft.confidence))),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await upsertProposal(proposal);
      results.push({ listingId: listing.id, kind: draft.kind });
    } catch {
      // One bad listing should never abort the whole pass.
      results.push({ listingId: listing.id, kind: "error" });
    }
  }

  await setLastResearchAt(new Date().toISOString());
  return NextResponse.json({
    ok: true,
    considered: candidates.length,
    proposed: results.filter((r) => !["hold", "none", "error"].includes(r.kind)).length,
    results,
  });
}
