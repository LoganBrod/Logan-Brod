import { NextResponse } from "next/server";
import { CALIBRATION_PROBES, CARDS, dealCards, type Probe } from "@/lib/calibration";
import { FALLBACK_DECK } from "@/lib/calibrationFallback";
import { calibrationPool } from "@/lib/calibrationPool";
import { readSeen, siftSeen } from "@/lib/seen";
import { conflictsWithSizes, hasSizes } from "@/lib/sizing";
import { readSizes } from "@/lib/taste";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
// Fifteen searches on a cold pool, a Redis read on a warm one, and no model
// call either way.
export const maxDuration = 60;

/**
 * GET /api/calibrate — a deck of real pieces to swipe through.
 *
 * No Claude, deliberately: the probes are fixed, so this costs nothing but the
 * shopping search. Somebody who has not yet seen the app do anything should not
 * be waiting on inference before their first screen.
 *
 * The band is wide on purpose. This is asking whether you like the *look* of
 * something, not whether you'd buy it — a narrow price range would quietly
 * turn a taste question into a budget one.
 */
export async function GET(req: Request) {
  // Shares the shop bucket: on a cold pool this is fifteen marketplace
  // searches, and the limiter cannot know in advance that it will be a
  // cache hit.
  const burst = await rateLimit("shop", clientIp(req), LIMITS.shop);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many requests just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  try {
    const { tasteId } = await readViewer(req);
    const [sizes, seen] = await Promise.all([
      tasteId ? readSizes(tasteId).catch(() => ({})) : Promise.resolve({}),
      readSeen(tasteId),
    ]);

    // Shared, and almost always cached: the probes and the band are the same
    // for everybody, so the searching is done once for all of them and only
    // what happens below here is personal. See lib/calibrationPool.ts.
    const pool = await calibrationPool();

    // Sizes still apply — being asked to rate a jacket you could never wear is
    // a worse question than not being asked.
    const sized = hasSizes(sizes) ? pool.filter((item) => !conflictsWithSizes(item.title, sizes)) : pool;

    // And nothing already shown, so a second pass through this isn't the same
    // fifteen pieces.
    const fresh = siftSeen(sized, seen, CARDS).pool;

    // Tag each listing with the slot of the probe that found it, so the deck
    // can be dealt alternating rather than four jackets in a row.
    // Widened to plain strings: the probes are `as const`, so the map's key
    // type would otherwise be the union of the fifteen literals and a lookup
    // by an arbitrary `matchedQuery` wouldn't typecheck.
    const byQuery = new Map<string, Probe>(CALIBRATION_PROBES.map((probe) => [probe.query, probe]));
    const tagged = fresh.map((listing) => ({
      ...listing,
      slot: byQuery.get(listing.matchedQuery ?? "")?.slot ?? "other",
      register: byQuery.get(listing.matchedQuery ?? "")?.register ?? null,
    }));

    // There is always a deck. This screen is the first thing a new visitor
    // sees and it is not optional, so an empty pool - no marketplace key, a
    // cold cache, a dead upstream - falls back to the app's own garments
    // rather than to an apology. See lib/calibrationFallback.ts.
    const cards = dealCards(tagged, CARDS);

    return NextResponse.json(
      { cards: cards.length ? cards : dealCards(FALLBACK_DECK, CARDS) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
