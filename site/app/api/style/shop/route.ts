import { NextResponse } from "next/server";
import { shop } from "@/lib/sources";
import { conflictsWithSizes, hasSizes } from "@/lib/sizing";
import { readSizes } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";
import { readSeen, siftSeen } from "@/lib/seen";

export const dynamic = "force-dynamic";
// Ten queries fanned across two sources, plus a possible taxonomy lookup on a
// cold start. The platform default would cut this off.
export const maxDuration = 60;

const MAX_QUERIES = 10;

/**
 * GET /api/style/shop?q=waxed+cotton+jacket&min=50&max=250
 *
 * Repeat `q` for multiple queries. Deliberately Claude-free so search quality
 * can be judged on its own before any model cost is involved.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const queries = searchParams.getAll("q").map((q) => q.trim()).filter(Boolean);
  const min = Number(searchParams.get("min") ?? 0);
  const max = Number(searchParams.get("max") ?? 0);

  if (!queries.length) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return NextResponse.json(
      { error: "min and max must be numbers with 0 <= min < max" },
      { status: 400 }
    );
  }

  try {
    // Sizes are read here rather than sent by the client: they are the one
    // preference where a wrong value silently ruins every result, so they come
    // from the server's own record under the id cookie, not from a request
    // body anyone could get wrong.
    const { tasteId } = await readViewer(req);
    const [sizes, seen] = await Promise.all([
      tasteId ? readSizes(tasteId).catch(() => ({})) : Promise.resolve({}),
      readSeen(tasteId),
    ]);

    // A wider net when sizes are known, because a good fraction of what comes
    // back is about to be dropped for stating a size that can't fit.
    const perQueryLimit = hasSizes(sizes) ? 50 : 30;
    const result = await shop(queries.slice(0, MAX_QUERIES), { min, max }, { perQueryLimit });

    const sized = hasSizes(sizes)
      ? result.listings.filter((item) => !conflictsWithSizes(item.title, sizes))
      : result.listings;

    // Struck out here rather than at curation, so a piece this person has
    // already had on their rail doesn't take up one of the ninety-six slots
    // the model is paid to look at.
    const sifted = siftSeen(sized, seen);

    return NextResponse.json(
      {
        ...result,
        listings: sifted.pool,
        // Reported so a collapsed result set reads as "your sizes are narrow"
        // rather than "the search is broken".
        droppedForSize: result.listings.length - sized.length,
        droppedAsSeen: sifted.removed,
        shownAgain: sifted.reused,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
