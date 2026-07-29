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
import { currentUserId } from "@/lib/auth";
import { cronAuthorized, tenantsWithEbay } from "@/lib/cron";
import { checkUsage, incrementUsage, planAllows } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Days a listing has been live, or null when we do not know. */
function daysLive(l: Listing): number | null {
  const start = l.outcome?.listedAt ?? l.publishedAt ?? l.createdAt;
  const t = Date.parse(start);
  if (!isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

interface TenantResult {
  userId: string;
  considered: number;
  proposed: number;
  autoApplied: number;
  skipped?: string;
}

/**
 * One seller's research pass. Re-comps their live listings against the market
 * as it is now and files a proposal per listing. Nothing here touches eBay
 * unless that seller's own automation settings say it may.
 */
async function researchForUser(userId: string): Promise<TenantResult> {
  if (!(await planAllows(userId, "proposals"))) {
    return { userId, considered: 0, proposed: 0, autoApplied: 0, skipped: "plan" };
  }
  if (!(await getEbayTokens(userId))) {
    return { userId, considered: 0, proposed: 0, autoApplied: 0, skipped: "no-ebay" };
  }
  if (!(await checkUsage(userId, "research")).allowed) {
    return { userId, considered: 0, proposed: 0, autoApplied: 0, skipped: "quota" };
  }

  const all = await listListings(userId);
  const pending = await listProposals(userId);
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

  const settings = await getSellerSettings(userId);
  const autoLevel = settings.automationLevel ?? "manual";
  const rules = settings.autoApplyRules ?? DEFAULT_AUTO_RULES;

  let proposed = 0;
  let autoApplied = 0;

  for (const listing of candidates) {
    try {
      let base64: string | undefined;
      if (listing.photos?.length) {
        const photo = await getPhoto(userId, listing.photos[0]);
        base64 = photo?.data.toString("base64");
      }
      const comps = await researchEbayComps(userId, listing.title, base64).catch(() => null);

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

      const draft = await proposeListingChange(
        userId,
        listing.id,
        compsContext,
        daysLive(listing) ?? 0
      );
      await incrementUsage(userId, "research");
      if (!draft || draft.kind === "hold") continue;

      const proposal: Proposal = {
        id: crypto.randomUUID(),
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

      let finalStatus: ProposalStatus = "pending";

      if (autoLevel !== "manual" && listing.ebayItemId) {
        const shouldAutoApply = checkAutoApplyRules(draft, listing, rules, autoLevel === "auto");
        if (shouldAutoApply) {
          try {
            // "relist" isn't a revise — it has no price/title/description of
            // its own, so it needs relistItem, not reviseEbayListing.
            if (draft.kind === "relist") {
              if (!listing.ebayOfferId) {
                throw new Error(
                  "wasn't published through LevoZ, so there's no eBay offer to withdraw"
                );
              }
              const newPrice = draft.proposedPrice > 0 ? draft.proposedPrice : listing.price;
              const result = await relistItem(userId, listing.ebayOfferId, newPrice);
              const record: RelistRecord = {
                oldItemId: listing.ebayItemId,
                newItemId: result.newListingId,
                oldPrice: listing.price,
                newPrice,
                at: new Date().toISOString(),
              };
              await updateListing(userId, listing.id, {
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
                // accepted the change, so the app never shows a price the
                // live listing does not have.
                await reviseEbayListing(
                  userId,
                  listing.ebayItemId,
                  changes,
                  listing.ebayListingType
                );
                await updateListing(userId, listing.id, {
                  ...(changes.price ? { price: changes.price } : {}),
                  ...(changes.title ? { title: changes.title } : {}),
                  ...(changes.description ? { description: changes.description } : {}),
                });
                finalStatus = "auto-applied";
              }
            }
          } catch (err) {
            // Auto-apply failed — fall back to manual review, keeping the
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
      await upsertProposal(userId, proposal);
      proposed++;
      if (finalStatus === "auto-applied") autoApplied++;
    } catch {
      // One bad listing should never abort the whole pass.
    }
  }

  await setLastResearchAt(userId, new Date().toISOString());
  return { userId, considered: candidates.length, proposed, autoApplied };
}

/**
 * Two legitimate callers, so two ways in:
 *  - a signed-in seller pressing "Run research", scoped to themselves
 *  - the scheduler holding CRON_SECRET, sweeping every tenant
 *
 * The old `?secret=` query-string option is gone: it put a shared credential
 * into URLs, which end up in access logs and referrer headers.
 */
export async function POST(req: NextRequest) {
  if (cronAuthorized(req)) {
    const results: TenantResult[] = [];
    for (const userId of await tenantsWithEbay()) {
      try {
        results.push(await researchForUser(userId));
      } catch (err) {
        results.push({
          userId,
          considered: 0,
          proposed: 0,
          autoApplied: 0,
          skipped: err instanceof Error ? err.message : "failed",
        });
      }
    }
    return NextResponse.json({
      ok: true,
      mode: "cron",
      tenants: results.length,
      proposed: results.reduce((n, r) => n + r.proposed, 0),
      autoApplied: results.reduce((n, r) => n + r.autoApplied, 0),
      results,
    });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  if (!(await planAllows(userId, "proposals"))) {
    return NextResponse.json(
      {
        error:
          "Brain proposals are a Pro feature. Upgrade to have LevoZ keep watching your listings.",
        upgrade: true,
      },
      { status: 402 }
    );
  }
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json({ error: "Connect your eBay account first" }, { status: 400 });
  }

  const result = await researchForUser(userId);
  return NextResponse.json({
    ok: true,
    mode: "interactive",
    considered: result.considered,
    proposed: result.proposed,
    autoApplied: result.autoApplied,
  });
}

// ---------------------------------------------------------------------------
// Automation rules helper
// ---------------------------------------------------------------------------

function checkAutoApplyRules(
  draft: { kind: string; proposedPrice: number; confidence: number; proposedDescription?: string },
  listing: Listing,
  rules: {
    maxPriceDrop: number;
    maxPriceDropPct: number;
    autoRetitle: boolean;
    autoRelist: boolean;
    requireReviewForRewrite: boolean;
    minConfidence: number;
  },
  isFullAuto: boolean
): boolean {
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

  if (draft.kind === "retitle") return rules.autoRetitle || isFullAuto;

  if (draft.kind === "rewrite") {
    // Full rewrites are risky — require review unless full auto.
    if (rules.requireReviewForRewrite && !isFullAuto) return false;
    return isFullAuto;
  }

  if (draft.kind === "relist") return rules.autoRelist || isFullAuto;

  return false;
}
