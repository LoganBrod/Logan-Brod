import { NextResponse } from "next/server";
import { describeApiError } from "@/lib/anthropic";
import { readCloset } from "@/lib/closet";
import {
  isCologneBudget,
  isCologneSlot,
  recommendColognes,
  type CologneBudget,
  type CologneSlot,
} from "@/lib/colognes";
import { readLibrary } from "@/lib/library";
import { renderPreferences } from "@/lib/preferences";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { readPreferences } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/colognes — fragrance recommendations from knowledge, not stock.
 *
 * No shopping search, deliberately: see the note at the top of lib/colognes.ts.
 * One model call, no images, so this is the cheapest thing in the app.
 *
 * A clozet is optional here rather than required. Somebody's clothes make the
 * recommendation better, but "what should I wear for a night out under fifty
 * quid" is answerable without them, and refusing to answer it would be a worse
 * page.
 */
export async function POST(req: Request) {
  let body: { slot?: unknown; budget?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!isCologneSlot(body.slot) || !isCologneBudget(body.budget)) {
    return NextResponse.json({ error: "Pick an occasion and a budget." }, { status: 400 });
  }
  const slot: CologneSlot = body.slot;
  const budget: CologneBudget = body.budget;

  const burst = await rateLimit("judge", clientIp(req), LIMITS.judge);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many requests just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  try {
    const viewer = await readViewer(req);
    const [library, prefs] = await Promise.all([
      readLibrary(viewer.owner),
      viewer.tasteId ? readPreferences(viewer.tasteId).catch(() => ({})) : Promise.resolve({}),
    ]);

    // Best-effort: a missing or expired clozet makes the answer more generic,
    // never an error.
    const closet = library[0] ? await readCloset(library[0].code).catch(() => null) : null;

    const advice = await recommendColognes(
      closet?.profile ?? null,
      slot,
      budget,
      renderPreferences(prefs)
    );

    return NextResponse.json(
      { advice, basedOnStyle: Boolean(closet) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
