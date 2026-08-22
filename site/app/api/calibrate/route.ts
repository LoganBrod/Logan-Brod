import { NextResponse } from "next/server";
import { CALIBRATION_PROBES, CARDS, PER_PROBE, dealCards, type Probe } from "@/lib/calibration";
import { readSeen, siftSeen } from "@/lib/seen";
import { shop } from "@/lib/sources";
import { conflictsWithSizes, hasSizes } from "@/lib/sizing";
import { readSizes } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
// Fifteen searches, no model call at all.
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
  try {
    const { tasteId } = await readViewer(req);
    const [sizes, seen] = await Promise.all([
      tasteId ? readSizes(tasteId).catch(() => ({})) : Promise.resolve({}),
      readSeen(tasteId),
    ]);

    const found = await shop(
      CALIBRATION_PROBES.map((probe) => probe.query),
      { min: 20, max: 400 },
      { perQueryLimit: PER_PROBE + 2 }
    );

    // Sizes still apply — being asked to rate a jacket you could never wear is
    // a worse question than not being asked.
    const sized = hasSizes(sizes)
      ? found.listings.filter((item) => !conflictsWithSizes(item.title, sizes))
      : found.listings;

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

    return NextResponse.json(
      { cards: dealCards(tagged, CARDS) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
