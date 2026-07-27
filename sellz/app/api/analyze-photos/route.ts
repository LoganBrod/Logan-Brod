import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPhoto } from "@/lib/photos";
import { generateFromPhotos, scoreListing, pickExperiment } from "@/lib/brain";
import { researchEbayComps, type CompsResult } from "@/lib/ebay";
import { addListing, getEbayTokens, type Listing } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Photos in, a saved draft listing out: identify the item with vision,
 * research comps against it, then write and save the listing.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const photoIds: string[] = Array.isArray(body.photoIds)
    ? body.photoIds.filter((p: unknown) => typeof p === "string").slice(0, 8)
    : [];
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";

  if (photoIds.length === 0) {
    return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });
  }

  // Load the stored images back for the vision call
  const images: { base64: string; mediaType: string }[] = [];
  for (const id of photoIds) {
    const photo = await getPhoto(id);
    if (!photo) {
      return NextResponse.json({ error: `Photo ${id} is missing` }, { status: 404 });
    }
    images.push({
      base64: photo.data.toString("base64"),
      mediaType: photo.contentType === "image/png" ? "image/png" : "image/jpeg",
    });
  }

  try {
    // First pass: what is this? (no comps yet — we need a search term)
    const firstPass = await generateFromPhotos(images, notes);

    // Comps, if eBay is connected. Never fatal — a comp failure shouldn't
    // block the seller from getting a draft. The front photo is sent too, so
    // eBay can match on the picture rather than only on our guessed wording.
    let comps: CompsResult | null = null;
    if (await getEbayTokens()) {
      comps = await researchEbayComps(
        [firstPass.brand, firstPass.identified, firstPass.size].filter(Boolean).join(" "),
        images[0]?.base64
      ).catch(() => null);
    }

    // Second pass: re-identify, re-price and re-word against what came back.
    // The comp titles matter as much as the prices here: they are how real
    // sellers name this exact object, which sharpens a shaky identification
    // far more than asking the model to look harder at the same photo.
    let final = firstPass;
    if (comps && comps.comps.length > 0) {
      const compLines = comps.comps
        .slice(0, 12)
        .map(
          (c) =>
            `- ${c.sold ? "SOLD" : "asking"} $${c.price}: ${c.title.slice(0, 80)}` +
            (c.sellerFeedbackPct ? ` (seller ${c.sellerFeedbackPct}% feedback)` : "")
        )
        .join("\n");

      const visualNote =
        comps.visualMatchCount > 0
          ? `eBay matched ${comps.visualMatchCount} of these from the photo itself, so the wording in those titles is strong evidence for what this item actually is. If they consistently disagree with your first identification, trust them and correct it.`
          : "These came from a keyword search, so treat the titles as weaker evidence of identity than the photo.";

      final = await generateFromPhotos(
        images,
        notes,
        `Comparable items on eBay right now:\n${compLines}\n\n${visualNote}\n\n${comps.note}${
          comps.suggestedPrice ? ` Median of these: $${comps.suggestedPrice}.` : ""
        }\nPrice this item against those comps and the seller's own playbook.`
      );
    }

    const experimentId = await pickExperiment();
    const listing: Listing = {
      id: crypto.randomUUID().slice(0, 8),
      platform: "ebay",
      title: final.title,
      description: final.description,
      price: final.price,
      category: final.category,
      condition: final.condition,
      tags: final.tags,
      photosNote: final.photosNote,
      status: "draft",
      source: "generated",
      photos: photoIds,
      experimentId,
      createdAt: new Date().toISOString(),
      ...(comps && comps.comps.length
        ? {
            comps: {
              summary: comps.note,
              priceLow: comps.priceLow,
              priceHigh: comps.priceHigh,
              demandNotes: `${comps.comps.length} comparable listings found${
                comps.soldDataAvailable ? ", including confirmed sold prices" : ""
              }.`,
              sources: comps.comps
                .map((c) => c.url)
                .filter((u): u is string => Boolean(u))
                .slice(0, 5),
              at: new Date().toISOString(),
            },
          }
        : {}),
    };

    await addListing(listing);
    void scoreListing(listing.id);

    return NextResponse.json({
      listing,
      analysis: {
        identified: final.identified,
        brand: final.brand,
        size: final.size,
        visibleFlaws: final.visibleFlaws,
        confidence: final.confidence,
        uncertainties: final.uncertainties,
      },
      comps: comps
        ? {
            note: comps.note,
            soldDataAvailable: comps.soldDataAvailable,
            visualMatchCount: comps.visualMatchCount,
            suggestedPrice: comps.suggestedPrice,
            priceLow: comps.priceLow,
            priceHigh: comps.priceHigh,
            top: comps.comps.slice(0, 8),
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo analysis failed" },
      { status: 502 }
    );
  }
}
