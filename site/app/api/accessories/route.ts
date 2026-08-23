import { NextResponse } from "next/server";
import { MAX_KINDS, isAccessoryKind, planAccessories, type AccessoryKind } from "@/lib/accessories";
import { describeApiError } from "@/lib/anthropic";
import { FINAL_PICKS, planBatches, rankAndCut } from "@/lib/batching";
import { readCloset } from "@/lib/closet";
import { curate } from "@/lib/curate";
import { readLibrary } from "@/lib/library";
import { renderPreferences } from "@/lib/preferences";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { readSeen, recordSeen, siftSeen } from "@/lib/seen";
import { shop } from "@/lib/sources";
import { conflictsWithSizes, hasSizes } from "@/lib/sizing";
import { readPreferences, readSizes, tasteMemo } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
// One cheap planning call, ten searches, and two curation batches.
export const maxDuration = 120;

/**
 * How many candidates get judged.
 *
 * Two batches rather than the clozet's six. Accessories are a narrower search
 * — a belt is a belt — so the pool is thinner and there is far less to sift.
 * It also keeps this a cheap page rather than a second full-price run, which
 * is the whole reason it reuses the profile instead of asking for photographs.
 */
const MAX_ACCESSORY_BATCHES = 2;

/**
 * POST /api/accessories — accessories, chosen against an existing clozet.
 *
 * The whole run happens here rather than being orchestrated from the browser
 * the way a clozet is. A clozet is worth streaming into a wardrobe as it fills;
 * this is a shorter search that returns a grid, and a page of client-side
 * batching for it would be a lot of machinery for a much smaller thing.
 */
export async function POST(req: Request) {
  let body: { kinds?: unknown; min?: unknown; max?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const kinds = (Array.isArray(body.kinds) ? body.kinds : [])
    .filter(isAccessoryKind)
    .slice(0, MAX_KINDS) as AccessoryKind[];

  if (!kinds.length) {
    return NextResponse.json({ error: "Pick at least one kind of accessory." }, { status: 400 });
  }

  const min = Number.isFinite(Number(body.min)) ? Math.max(0, Number(body.min)) : 20;
  const max = Number.isFinite(Number(body.max)) ? Number(body.max) : 150;
  if (max <= min) {
    return NextResponse.json({ error: "The maximum has to be above the minimum." }, { status: 400 });
  }

  // Guarded on the address like the other routes that spend money. Metered
  // against `curate` rather than `analyze`: this spends about what one batch of
  // a clozet does, not what a whole run does.
  const burst = await rateLimit("curate", clientIp(req), LIMITS.curate);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many requests just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  const viewer = await readViewer(req);

  try {
    // The most recent clozet is the style. Without one there is nothing to
    // match against, and asking for photographs here would make this the
    // second full run this page exists to avoid.
    const library = await readLibrary(viewer.owner);
    const latest = library[0];
    if (!latest) {
      return NextResponse.json(
        {
          error:
            "Build a clozet first - accessories are chosen against the style it reads from your photos.",
          needsCloset: true,
        },
        { status: 409 }
      );
    }

    const closet = await readCloset(latest.code);
    if (!closet) {
      return NextResponse.json(
        { error: "That clozet has expired. Build a new one and try again.", needsCloset: true },
        { status: 409 }
      );
    }

    const [memo, prefs, sizes, seen] = await Promise.all([
      tasteMemo(viewer.tasteId),
      viewer.tasteId ? readPreferences(viewer.tasteId).catch(() => ({})) : Promise.resolve({}),
      viewer.tasteId ? readSizes(viewer.tasteId).catch(() => ({})) : Promise.resolve({}),
      readSeen(viewer.tasteId),
    ]);

    const plan = await planAccessories(closet.profile, kinds, { min, max }, renderPreferences(prefs));
    if (!plan.queries.length) {
      return NextResponse.json({ error: "Couldn't write searches for those." }, { status: 502 });
    }

    const found = await shop(
      plan.queries.map((q) => q.query),
      { min, max },
      { perQueryLimit: 30 }
    );

    // Sizes matter less here — a belt has a length, a scarf has none — but a
    // stated size that can't fit is still a stated size that can't fit.
    const sized = hasSizes(sizes)
      ? found.listings.filter((item) => !conflictsWithSizes(item.title, sizes))
      : found.listings;

    const sifted = siftSeen(sized, seen);
    const batches = planBatches(sifted.pool, { maxBatches: MAX_ACCESSORY_BATCHES });
    if (!batches.length) {
      return NextResponse.json(
        { error: "Nothing came back with a usable photo. Try a wider price range." },
        { status: 502 }
      );
    }

    // "similar", not "gaps" — even though accessories are in a sense the gap.
    // `gaps` puts the profile's own "Gaps to fill: boots, trousers" line in
    // front of the judge, and those are the *clothing* gaps read from the
    // uploads. Judging a belt against a list that says this person needs
    // trousers is worse than judging it against nothing. What the searches are
    // looking for is already settled by this point; the judge's job here is
    // only whether a given piece suits the palette and the register.
    const curated = await Promise.all(
      batches.map((batch) =>
        curate(closet.profile, batch, memo, FINAL_PICKS, undefined, "similar", prefs).catch(
          () => null
        )
      )
    );

    // The slot cap is disabled here, deliberately. A belt, a cap, a bag and a
    // watch all normalise to the one `accessories` slot, so the clozet's rule
    // of four-per-slot would cap this entire page at four pieces and read as a
    // search that found nothing.
    const items = rankAndCut(
      curated.flatMap((result) => result?.items ?? []),
      FINAL_PICKS,
      FINAL_PICKS
    );

    // Recorded like a clozet's picks, so the next run — of either kind —
    // doesn't hand back the same belt.
    await recordSeen(
      viewer.tasteId,
      items.map((item) => item.id)
    );

    return NextResponse.json(
      {
        items,
        summary: plan.summary,
        basedOn: { code: closet.code, createdAt: closet.createdAt },
        notes: curated
          .map((result) => result?.notes)
          .filter(Boolean)
          .join(" "),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
