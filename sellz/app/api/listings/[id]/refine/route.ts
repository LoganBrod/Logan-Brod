import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";
import { generateFromPhotos, scoreListing } from "@/lib/brain";
import { getPhoto } from "@/lib/photos";

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
  const listing = await getListing(params.id);
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
    const photo = await getPhoto(id);
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

  try {
    const final = await generateFromPhotos(
      images,
      notes,
      [
        compsText ? `Comparable items on eBay right now:\n${compsText}` : "",
        compsText ? visualNote : "",
        compsNote,
        suggestedPrice ? `Median of these: $${suggestedPrice}.` : "",
        retailNote,
        "Price this item against those comps and the seller's own playbook.",
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    await updateListing(listing.id, {
      title: final.title,
      description: final.description,
      price: final.price,
      category: final.category,
      condition: final.condition,
      tags: final.tags,
      photosNote: final.photosNote,
      itemSpecifics: final.itemSpecifics ?? listing.itemSpecifics,
    });
    void scoreListing(listing.id);

    return NextResponse.json({
      listing: await getListing(listing.id),
      refined: true,
      analysis: {
        identified: final.identified,
        brand: final.brand,
        size: final.size,
        visibleFlaws: final.visibleFlaws,
        confidence: final.confidence,
        uncertainties: final.uncertainties,
      },
      itemSpecifics: final.itemSpecifics ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refine failed" },
      { status: 502 }
    );
  }
}
