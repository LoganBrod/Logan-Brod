import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import crypto from "crypto";
import { addListing, type Listing } from "@/lib/store";
import {
  experimentInstruction,
  generateListings,
  pickExperiment,
  scoreListing,
} from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 600;

/** Generate listing drafts for a described item; kicks scoring. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const platform = ["ebay", "depop", "other"].includes(body.platform)
    ? body.platform
    : "ebay";
  const count = Math.max(1, Math.min(3, Number(body.count) || 1));
  const item = typeof body.item === "string" ? body.item.slice(0, 2000) : "";

  try {
    const listings: Listing[] = [];
    for (let i = 0; i < count; i++) {
      const experimentId = await pickExperiment(userId);
      const [gen] = await generateListings(userId, 
        item,
        platform,
        1,
        await experimentInstruction(userId, experimentId)
      );
      const listing: Listing = {
        id: crypto.randomUUID(),
        platform,
        title: gen.title,
        description: gen.description,
        price: gen.price,
        category: gen.category,
        condition: gen.condition,
        tags: gen.tags,
        photosNote: gen.photosNote,
        status: "draft",
        source: "generated",
        experimentId,
        createdAt: new Date().toISOString(),
      };
      await addListing(userId, listing);
      void scoreListing(userId, listing.id);
      listings.push(listing);
    }
    return NextResponse.json(listings);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 502 }
    );
  }
}
