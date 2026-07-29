import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getEbayTokens,
  getSellerSettings,
  listListings,
  listProposals,
  setLastResearchAt,
  updateListing,
  upsertProposal,
  DEFAULT_AUTO_RULES,
  type Listing,
  type Proposal,
  type ProposalStatus,
  type RelistRecord,
} from "@/lib/store";
import { researchEbayComps, reviseEbayListing, relistItem } from "@/lib/ebay";
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

  const results: { listingId: string; kind: string; autoApplied?: boolean }[] = [];

  // Read once, not once per listing — on Blobs every read is a round trip.
  const settings = await getSellerSettings();
  const autoLevel = settings.automationLevel ?? "manual";
  const rules = settings.autoApplyRules ?? DEFAULT_AUTO_RULES;

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

      // ---- Automation level check ----
      let finalStatus: ProposalStatus = "pending";

      if (autoLevel !== "manual" && listing.ebayItemId) {
        const shouldAutoApply = checkAutoApplyRules(
          draft,
          listing,
          rules,
          autoLevel === "auto"
        );

        if (shouldAutoApply) {
          try {
            // "relist" isn't a revise — it has no price/title/description of
            // its own, so it needs relistItem, not reviseEbayListing. The
            // rule check above already says yes for relist proposals, but
            // nothing downstream ever executed one: this branch was simply
            // missing, so autoRelist and full-auto silently did nothing.
            if (draft.kind === "relist") {
              if (!listing.ebayOfferId) {
                throw new Error(
                  "wasn't published through LevoZ, so there's no eBay offer to withdraw"
                );
              }
              const newPrice = draft.proposedPrice > 0 ? draft.proposedPrice : listing.price;
              const result = await relistItem(listing.ebayOfferId, newPrice);
              const record: RelistRecord = {
                oldItemId: listing.ebayItemId,
                newItemId: result.newListingId,
                oldPrice: listing.price,
                newPrice,
                at: new Date().toISOString(),
              };
              await updateListing(listing.id, {
                ebayItemId: result.newListingId,
                price: newPrice,
                relistHistory: [...(listing.relistHistory ?? []), record],
                lastRelistedAt: record.at,
              });
              finalStatus = "auto-applied";
            } else {
              const changes: { price?: number; title?: string; description?: string } = {};
              if (draft.kind === "reprice" && draft.proposedPrice > 0) {
                changes.price = draft.proposedPrice;
              }
              if (draft.kind === "retitle" && draft.proposedTitle?.trim()) {
                changes.title = draft.proposedTitle.trim();
              }
              if (draft.kind === "rewrite" && draft.proposedDescription?.trim()) {
                changes.title = draft.proposedTitle?.trim() || undefined;
                changes.description = draft.proposedDescription.trim();
              }

              if (Object.keys(changes).length > 0) {
                // eBay first. The local copy is only updated once eBay has
                // actually accepted the change, so the app never shows a
                // price the live listing does not have.
                await reviseEbayListing(listing.ebayItemId, changes, listing.ebayListingType);
                await updateListing(listing.id, {
                  ...(changes.price ? { price: changes.price } : {}),
                  ...(changes.title ? { title: changes.title } : {}),
                  ...(changes.description ? { description: changes.description } : {}),
                });
                finalStatus = "auto-applied";
              }
            }
          } catch (err) {
            // Auto-apply failed — fall back to manual review, and keep the
            // reason so the seller sees why rather than an unexplained
            // proposal sitting in the queue.
            finalStatus = "pending";
            proposal.error =
              err instanceof Error
                ? `Couldn't apply automatically: ${err.message}`
                : "Couldn't apply automatically";
          }
        }
      }

      proposal.status = finalStatus;
      await upsertProposal(proposal);
      results.push({
        listingId: listing.id,
        kind: draft.kind,
        autoApplied: finalStatus === "auto-applied",
      });
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
    autoApplied: results.filter((r) => r.autoApplied).length,
    results,
  });
}

// ---------------------------------------------------------------------------
// Automation rules helper
// ---------------------------------------------------------------------------

function checkAutoApplyRules(
  draft: { kind: string; proposedPrice: number; confidence: number; proposedDescription?: string },
  listing: Listing,
  rules: { maxPriceDrop: number; maxPriceDropPct: number; autoRetitle: boolean; autoRelist: boolean; requireReviewForRewrite: boolean; minConfidence: number },
  isFullAuto: boolean
): boolean {
  // Confidence check applies to all modes
  if (draft.confidence < rules.minConfidence) return false;

  if (draft.kind === "reprice") {
    if (isFullAuto) return true;
    // Caps apply in both directions. A raise is not inherently safe — it can
    // stall a listing that was close to selling — and an uncapped one is
    // exactly the surprise these limits exist to prevent.
    const delta = Math.abs(listing.price - draft.proposedPrice);
    const deltaPct = listing.price > 0 ? (delta / listing.price) * 100 : 100;
    return delta <= rules.maxPriceDrop && deltaPct <= rules.maxPriceDropPct;
  }

  if (draft.kind === "retitle") {
    return rules.autoRetitle || isFullAuto;
  }

  if (draft.kind === "rewrite") {
    // Full rewrites are risky — require review unless full auto
    if (rules.requireReviewForRewrite && !isFullAuto) return false;
    return isFullAuto;
  }

  if (draft.kind === "relist") {
    return rules.autoRelist || isFullAuto;
  }

  return false;
}
