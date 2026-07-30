import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, getEbayTokens, getSellerSettings, type ItemSpecific } from "@/lib/store";
import { generateFromPhotos, scoreListing, fillMissingAspects } from "@/lib/brain";
import { resolveAspectGaps } from "@/lib/ebay";
import { publishListing } from "@/lib/publishListing";
import { planAllows } from "@/lib/usage";
import { getPhoto } from "@/lib/photos";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const maxDuration = 300;

interface CompLine {
  sold: boolean;
  price: number;
  title: string;
  sellerFeedbackPct?: number;
}

/**
 * Final stage: re-identify, re-price and re-word the draft against the comps
 * and retail research gathered in the previous stages.
 *
 * Comp titles matter as much as comp prices here — they are how real sellers
 * name this exact object, which corrects a shaky identification far better
 * than asking the model to stare at the same photo again.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";
  const compLines: CompLine[] = Array.isArray(body.compLines) ? body.compLines.slice(0, 12) : [];
  const visualMatchCount = Number(body.visualMatchCount) || 0;
  const compsNote = typeof body.compsNote === "string" ? body.compsNote : "";
  const suggestedPrice = Number(body.suggestedPrice) || undefined;

  if (compLines.length === 0 && !listing.retail) {
    // Nothing new to reason about — the first pass already stands.
    return NextResponse.json({ listing, refined: false });
  }

  const images: { base64: string; mediaType: string }[] = [];
  for (const id of listing.photos ?? []) {
    const photo = await getPhoto(userId, id);
    if (photo) {
      images.push({
        base64: photo.data.toString("base64"),
        mediaType: photo.contentType === "image/png" ? "image/png" : "image/jpeg",
      });
    }
  }
  if (images.length === 0) {
    return NextResponse.json({ error: "Photos are missing" }, { status: 404 });
  }

  const compsText = compLines
    .map(
      (c) =>
        `- ${c.sold ? "SOLD" : "asking"} $${c.price}: ${String(c.title).slice(0, 80)}` +
        (c.sellerFeedbackPct ? ` (seller ${c.sellerFeedbackPct}% feedback)` : "")
    )
    .join("\n");

  const visualNote =
    visualMatchCount > 0
      ? `eBay matched ${visualMatchCount} of these from the photo itself, so the wording in those titles is strong evidence for what this item actually is. If they consistently disagree with your first identification, trust them and correct it.`
      : "These came from a keyword search, so treat the titles as weaker evidence of identity than the photo.";

  const r = listing.retail;
  const retailNote = r
    ? r.retailPrice > 0
      ? `\n\nRetail side: this appears to be "${r.productName}", originally around $${r.retailPrice} (${r.retailPriceNote}). ${r.desirability}${
          r.sellingPoints.length
            ? ` Worth mentioning in the description: ${r.sellingPoints.join("; ")}.`
            : ""
        }`
      : `\n\nRetail side: likely "${r.productName}". ${r.retailPriceNote} ${r.desirability}`
    : "";

  // eBay requires specific fields per category — ask about them now, while
  // the seller can still fix a gap, rather than finding out at publish time.
  // An arrow const rather than a function declaration: a hoisted declaration
  // is considered callable before the 401 guard above, so TypeScript will not
  // narrow the captured userId to a string inside it.
  const resolveAspects = async (
    title: string,
    specifics: ItemSpecific[]
  ): Promise<{ itemSpecifics: ItemSpecific[]; missingAspects: string[] }> => {
    if (!(await getEbayTokens(userId))) return { itemSpecifics: specifics, missingAspects: [] };
    try {
      const gaps = await resolveAspectGaps(userId, title, specifics);
      if (gaps.missingRequired.length === 0) return { itemSpecifics: specifics, missingAspects: [] };

      const filled = await fillMissingAspects(
        images,
        gaps.missingRequired.map((a) => a.name)
      );
      const have = new Set(specifics.map((s) => s.name.toLowerCase()));
      const itemSpecifics = filled.length
        ? [...specifics, ...filled.filter((f) => !have.has(f.name.toLowerCase()))]
        : specifics;

      const stillCovered = new Set(itemSpecifics.map((s) => s.name.toLowerCase()));
      const missingAspects = gaps.missingRequired
        .map((a) => a.name)
        .filter((name) => !stillCovered.has(name.toLowerCase()));
      return { itemSpecifics, missingAspects };
    } catch {
      // Aspect lookup is a nicety on top of a listing that already works —
      // never let it block the refine pass from landing.
      return { itemSpecifics: specifics, missingAspects: [] };
    }
  };

  const compsContext = [
    compsText ? `Comparable items on eBay right now:\n${compsText}` : "",
    compsText ? visualNote : "",
    compsNote,
    suggestedPrice ? `Median of these: $${suggestedPrice}.` : "",
    retailNote,
    "Price this item against those comps and the seller's own playbook.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const final = await generateFromPhotos(userId, images, notes, compsContext);

    let { itemSpecifics, missingAspects } = await resolveAspects(
      final.title,
      final.itemSpecifics ?? listing.itemSpecifics ?? []
    );

    await updateListing(userId, listing.id, {
      title: final.title,
      description: final.description,
      price: final.price,
      category: final.category,
      condition: final.condition,
      tags: final.tags,
      photosNote: final.photosNote,
      itemSpecifics,
    });

    // Grade the draft before the seller ever sees it. If one dimension is
    // dragging the whole listing down, take one shot at fixing exactly that
    // — a targeted rewrite beats shipping a known-weak draft and hoping the
    // seller notices the fix panel later. Capped at a single retry so a
    // stubbornly low score can't loop the pipeline.
    let score = await scoreListing(userId, listing.id);
    let selfCorrected = false;
    let analysis = final;

    if (score?.breakdown?.length) {
      const weakest = score.breakdown.reduce((min, d) => (d.score < min.score ? d : min));
      if (weakest.score < 55) {
        try {
          const corrected = await generateFromPhotos(userId, 
            images,
            notes,
            `${compsContext}\n\nSelf-correction before this reaches the seller: a first pass scored this listing's "${weakest.dimension}" at only ${weakest.score}/100 — ${weakest.detail} Fix that specifically without regressing anything else.`
          );
          const resolved = await resolveAspects(
            corrected.title,
            corrected.itemSpecifics ?? itemSpecifics
          );
          itemSpecifics = resolved.itemSpecifics;
          missingAspects = resolved.missingAspects;
          analysis = corrected;
          await updateListing(userId, listing.id, {
            title: corrected.title,
            description: corrected.description,
            price: corrected.price,
            category: corrected.category,
            condition: corrected.condition,
            tags: corrected.tags,
            photosNote: corrected.photosNote,
            itemSpecifics,
          });
          score = await scoreListing(userId, listing.id);
          selfCorrected = true;
        } catch {
          // Keep the first pass — a failed retry must not lose a working draft.
        }
      }
    }

    // The one setting that skips a human entirely — only fires when the
    // seller has explicitly set a threshold above 0, and only on a score
    // computed after any self-correction above has already run.
    let autoPublished = false;
    let autoPublishError: string | undefined;
    const settings = await getSellerSettings(userId);
    if (
      settings.autoPublishThreshold > 0 &&
      (score?.score ?? 0) >= settings.autoPublishThreshold &&
      // Paid feature. Checked against the plan in the database rather than a
      // stored setting, so a downgraded account stops auto-publishing at once
      // instead of when it next happens to reload its settings.
      (await planAllows(userId, "autoPublish"))
    ) {
      const origin = publicOrigin(req.nextUrl.origin);
      const outcome = await publishListing(userId, listing.id, origin);
      autoPublished = outcome.ok;
      if (!outcome.ok) autoPublishError = outcome.error;
    }

    return NextResponse.json({
      listing: await getListing(userId, listing.id),
      refined: true,
      selfCorrected,
      autoPublished,
      autoPublishError,
      score,
      analysis: {
        identified: analysis.identified,
        brand: analysis.brand,
        size: analysis.size,
        visibleFlaws: analysis.visibleFlaws,
        confidence: analysis.confidence,
        uncertainties: analysis.uncertainties,
      },
      itemSpecifics,
      missingAspects,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refine failed" },
      { status: 502 }
    );
  }
}
