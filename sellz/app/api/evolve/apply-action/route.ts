import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import crypto from "crypto";
import {
  getListing,
  listProposals,
  upsertProposal,
  type Proposal,
  type ProposalKind,
} from "@/lib/store";
import { proposeListingChange } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

const KINDS: ProposalKind[] = ["reprice", "retitle", "rewrite", "relist", "hold"];

/**
 * Turns one playbook action card into real proposals the seller can approve
 * — the same review queue the nightly research pass files into, not a
 * silent bypass. "Apply to 12 Nike listings" means 12 proposals appear in
 * the Insight report, not 12 unreviewed changes hitting eBay.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const insight = typeof body.insight === "string" ? body.insight.slice(0, 400) : "";
  const action: ProposalKind = KINDS.includes(body.action) ? body.action : "hold";
  const listingIds: string[] = Array.isArray(body.matchListingIds)
    ? body.matchListingIds.filter((id: unknown) => typeof id === "string").slice(0, 25)
    : [];

  if (!insight || listingIds.length === 0) {
    return NextResponse.json({ error: "insight and matchListingIds are required" }, { status: 400 });
  }

  const pending = await listProposals(userId);
  const alreadyPending = new Set(
    pending.filter((p) => p.status === "pending").map((p) => p.listingId)
  );

  const results: { listingId: string; created: boolean; kind?: string }[] = [];

  for (const id of listingIds) {
    if (alreadyPending.has(id)) {
      results.push({ listingId: id, created: false });
      continue;
    }
    const listing = await getListing(userId, id);
    if (!listing) {
      results.push({ listingId: id, created: false });
      continue;
    }
    try {
      const draft = await proposeListingChange(userId, 
        id,
        `Apply this specific playbook insight to this listing: "${insight}". A "${action}" change is what the playbook suggests here, but judge the listing on its own evidence too.`,
        0
      );
      if (!draft || draft.kind === "hold") {
        results.push({ listingId: id, created: false });
        continue;
      }
      const proposal: Proposal = {
        id: crypto.randomUUID(),
        listingId: id,
        kind: draft.kind,
        summary: draft.summary,
        rationale: draft.rationale,
        currentPrice: listing.price,
        proposedPrice: draft.kind === "reprice" && draft.proposedPrice > 0 ? draft.proposedPrice : undefined,
        currentTitle: listing.title,
        proposedTitle: draft.proposedTitle?.trim() || undefined,
        proposedDescription: draft.proposedDescription?.trim() || undefined,
        confidence: Math.max(0, Math.min(100, Math.round(draft.confidence))),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await upsertProposal(userId, proposal);
      results.push({ listingId: id, created: true, kind: draft.kind });
    } catch {
      results.push({ listingId: id, created: false });
    }
  }

  return NextResponse.json({
    ok: true,
    created: results.filter((r) => r.created).length,
    skipped: results.filter((r) => !r.created).length,
    results,
  });
}
