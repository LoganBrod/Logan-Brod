import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import crypto from "crypto";
import { getPhoto } from "@/lib/photos";
import { generateFromPhotos, pickExperiment } from "@/lib/brain";
import { addListing, getEbayTokens, type Listing } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Stage 1 of analysis: identify the item from its photos and save a draft.
 *
 * Deliberately ONE model call. Comps, retail research and the refine pass
 * each run as their own request afterwards — together they need far longer
 * than a serverless function is allowed to run (Netlify cuts off around 26s
 * and returns an HTML error page), so doing it all here made the whole
 * feature fail rather than just be slow.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const photoIds: string[] = Array.isArray(body.photoIds)
    ? body.photoIds.filter((p: unknown) => typeof p === "string").slice(0, 8)
    : [];
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";

  if (photoIds.length === 0) {
    return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });
  }

  const images: { base64: string; mediaType: string }[] = [];
  for (const id of photoIds) {
    const photo = await getPhoto(userId, id);
    if (!photo) {
      return NextResponse.json({ error: `Photo ${id} is missing` }, { status: 404 });
    }
    images.push({
      base64: photo.data.toString("base64"),
      mediaType: photo.contentType === "image/png" ? "image/png" : "image/jpeg",
    });
  }

  try {
    const first = await generateFromPhotos(userId, images, notes);
    const experimentId = await pickExperiment(userId);

    const listing: Listing = {
      id: crypto.randomUUID(),
      platform: "ebay",
      title: first.title,
      description: first.description,
      price: first.price,
      category: first.category,
      condition: first.condition,
      tags: first.tags,
      photosNote: first.photosNote,
      status: "draft",
      source: "generated",
      photos: photoIds,
      experimentId,
      itemSpecifics: first.itemSpecifics ?? [],
      createdAt: new Date().toISOString(),
    };

    await addListing(userId, listing);

    return NextResponse.json({
      listing,
      analysis: {
        identified: first.identified,
        brand: first.brand,
        size: first.size,
        visibleFlaws: first.visibleFlaws,
        confidence: first.confidence,
        uncertainties: first.uncertainties,
      },
      itemSpecifics: first.itemSpecifics ?? [],
      // The client drives the remaining stages with these
      query: [first.brand, first.identified, first.size].filter(Boolean).join(" "),
      notes,
      ebayConnected: Boolean(await getEbayTokens(userId)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo analysis failed" },
      { status: 502 }
    );
  }
}
