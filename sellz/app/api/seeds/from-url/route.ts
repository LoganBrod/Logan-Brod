import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addSeedListing, getEbayTokens, listSeedListings } from "@/lib/store";
import { fetchEbayItem, parseEbayItemId, type EbayItemDetail } from "@/lib/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Turn a description of a real listing into the one-line summary the Brain
 * reads. Everything here comes off the listing itself — nothing is inferred,
 * because a reference listing is only useful if it is true.
 */
function describe(d: EbayItemDetail): string {
  const parts = [`"${d.title}"`];
  if (d.categoryName) parts.push(`category: ${d.categoryName}`);
  if (d.condition) parts.push(`condition: ${d.condition}`);
  parts.push(d.quantitySold > 0 ? `SOLD for $${d.price.toFixed(2)}` : `asking $${d.price.toFixed(2)}`);
  parts.push(`${d.imageUrls.length} photos`);
  if (d.itemSpecifics.length) {
    parts.push(
      `specifics: ${d.itemSpecifics
        .slice(0, 12)
        .map((s) => `${s.name}=${s.value}`)
        .join(", ")}`
    );
  }
  if (d.description) {
    const desc = d.description.replace(/\s+/g, " ").slice(0, 220);
    if (desc.length > 20) parts.push(`description opens: "${desc}"`);
  }
  return parts.join(" | ").slice(0, 600);
}

/** How well the seller is rated, which is why this listing is worth copying. */
function stats(d: EbayItemDetail): string | undefined {
  const bits: string[] = [];
  if (d.sellerFeedbackPct !== undefined) bits.push(`${d.sellerFeedbackPct}% positive`);
  if (d.sellerFeedbackScore !== undefined) bits.push(`${d.sellerFeedbackScore} feedback`);
  if (d.quantitySold > 0) bits.push(`${d.quantitySold} sold`);
  return bits.length ? bits.join(", ").slice(0, 100) : undefined;
}

/**
 * Feed the Brain by pasting eBay listing links rather than writing a
 * description of each one by hand. Each URL is looked up on eBay and broken
 * down into a reference listing.
 */
export async function POST(req: NextRequest) {
  if (!(await getEbayTokens())) {
    return NextResponse.json(
      { error: "Connect your eBay account first — the links are looked up through eBay." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.urls === "string" ? body.urls : "";
  // Accept one per line, comma separated, or pasted as a block.
  const candidates = raw
    .split(/[\s,]+/)
    .map((s: string) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "Paste at least one eBay listing link" }, { status: 400 });
  }

  const results: { input: string; ok: boolean; title?: string; error?: string }[] = [];
  const seen = new Set<string>();

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
      const detail = await fetchEbayItem(itemId);
      if (!detail.title) {
        results.push({ input, ok: false, error: "eBay returned no listing for that link" });
        continue;
      }
      await addSeedListing({
        id: crypto.randomUUID().slice(0, 8),
        description: describe(detail),
        source: detail.url ?? `https://www.ebay.com/itm/${itemId}`,
        stats: stats(detail),
        addedAt: new Date().toISOString(),
      });
      results.push({ input, ok: true, title: detail.title });
    } catch (err) {
      results.push({
        input,
        ok: false,
        error: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }

  return NextResponse.json({
    added: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    seeds: await listSeedListings(),
  });
}
