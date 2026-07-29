import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import crypto from "crypto";
import { addListing, getEbayTokens, listListings, updateListing, type Listing } from "@/lib/store";
import { fetchEbayItem, parseEbayItemId } from "@/lib/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Import listings by pasting their eBay links. Saves describing each one by
 * hand: the title, price, condition, photos, item specifics and sold status
 * all come off the listing itself.
 *
 * Re-importing a link updates the existing row rather than adding a second
 * copy, so pasting an overlapping batch twice is harmless.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json(
      { error: "Connect your eBay account first — the links are looked up through eBay." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.urls === "string" ? body.urls : "";
  const candidates = raw
    .split(/[\s,]+/)
    .map((s: string) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "Paste at least one eBay listing link" }, { status: 400 });
  }

  const existing = await listListings(userId);
  const byItemId = new Map(existing.filter((l) => l.ebayItemId).map((l) => [l.ebayItemId!, l]));

  const results: { input: string; ok: boolean; title?: string; error?: string }[] = [];
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const input of candidates) {
    const itemId = parseEbayItemId(input);
    if (!itemId) {
      results.push({ input, ok: false, error: "Not an eBay listing link" });
      continue;
    }
    if (seen.has(itemId)) {
      results.push({ input, ok: false, error: "Duplicate of another link in this batch" });
      continue;
    }
    seen.add(itemId);

    try {
      const d = await fetchEbayItem(userId, itemId);
      if (!d.title) {
        results.push({ input, ok: false, error: "eBay returned no listing for that link" });
        continue;
      }

      const sold = d.quantitySold > 0;
      const ended = !sold && d.endsAt ? Date.parse(d.endsAt) < Date.now() : false;
      const outcome = {
        views: 0,
        watchers: 0,
        offers: 0,
        soldPrice: sold ? d.price : undefined,
        listedAt: d.listedAt,
        soldAt: sold ? d.endsAt : undefined,
        updatedAt: new Date().toISOString(),
      };

      const prior = byItemId.get(itemId);
      if (prior) {
        await updateListing(userId, prior.id, {
          title: d.title,
          price: d.price,
          condition: d.condition ?? prior.condition,
          category: d.categoryName ?? prior.category,
          description: d.description ?? prior.description,
          imageUrls: d.imageUrls.length ? d.imageUrls : prior.imageUrls,
          ebayCategoryId: d.categoryId ?? prior.ebayCategoryId,
          ebayListingType: d.listingType ?? prior.ebayListingType,
          itemSpecifics: d.itemSpecifics.length
            ? d.itemSpecifics.map((s) => ({ ...s, source: "tag" as const }))
            : prior.itemSpecifics,
          status: sold ? "sold" : ended ? "ended" : "active",
          outcome: { ...outcome, views: prior.outcome?.views ?? 0 },
        });
        updated++;
      } else {
        const listing: Listing = {
          id: crypto.randomUUID(),
          platform: "ebay",
          title: d.title,
          description: d.description ?? "",
          price: d.price,
          category: d.categoryName ?? "",
          condition: d.condition ?? "",
          tags: [],
          photosNote: "",
          status: sold ? "sold" : ended ? "ended" : "active",
          source: "imported",
          ebayItemId: itemId,
          ebayCategoryId: d.categoryId,
          ebayListingType: d.listingType,
          imageUrls: d.imageUrls,
          itemSpecifics: d.itemSpecifics.map((s) => ({ ...s, source: "tag" as const })),
          experimentId: "control",
          outcome,
          createdAt: d.listedAt ?? new Date().toISOString(),
        };
        await addListing(userId, listing);
        created++;
      }
      results.push({ input, ok: true, title: d.title });
    } catch (err) {
      results.push({
        input,
        ok: false,
        error: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }

  return NextResponse.json({ created, updated, failed: results.filter((r) => !r.ok).length, results });
}
