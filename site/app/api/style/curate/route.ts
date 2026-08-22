import { NextResponse } from "next/server";
import { curate } from "@/lib/curate";
import type { Intent } from "@/lib/analyze";
import { PICKS_PER_BATCH } from "@/lib/batching";
import { describeApiError } from "@/lib/anthropic";
import { StyleProfileSchema } from "@/lib/schemas";
import { parseInlinePhotos } from "@/lib/photos";
import { readPreferences, tasteMemo } from "@/lib/taste";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { readViewer } from "@/lib/viewer";
import type { ProductListing } from "@/lib/sources/types";

export const dynamic = "force-dynamic";
// One batch of candidate photos, not the whole pool. The client fans several of
// these out at once, which is both faster and — because each invocation is now
// short — safely inside the 60s function cap on Vercel's Hobby plan.
export const maxDuration = 120;

/**
 * The ceiling on one reference photo, in base64 characters.
 *
 * The client sends these at 256px on the long edge, which is around 15KB of
 * base64 — generous room above that, and far below what an honest client would
 * ever produce. It matters because these repeat: every batch of a run carries
 * the same set, so an unbounded upload here is billed six times over.
 * Oversized entries are dropped rather than refused, since the profile alone
 * still gives a usable curation.
 */
const MAX_REFERENCE_BASE64_CHARS = 256 * 1024;

/**
 * POST /api/style/curate — scores one batch of candidates against the profile.
 *
 * `limit` is how many picks this batch should return; the client merges the
 * batches and keeps the best overall.
 */
export async function POST(req: Request) {
  let body: {
    profile?: unknown;
    candidates?: unknown;
    limit?: unknown;
    uploads?: unknown;
    intent?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsedProfile = StyleProfileSchema.safeParse(body.profile);
  if (!parsedProfile.success) {
    return NextResponse.json(
      { error: "profile is missing or malformed; re-run the analyze step." },
      { status: 400 }
    );
  }

  const candidates = Array.isArray(body.candidates)
    ? (body.candidates as ProductListing[]).filter(
        (c) => c && typeof c.id === "string" && typeof c.title === "string"
      )
    : [];

  if (!candidates.length) {
    return NextResponse.json({ error: "candidates must be a non-empty array." }, { status: 400 });
  }

  /*
   * Guarded on the address, like analyze, and for the same reason: this route
   * took no cookie and no session either. It does not spend a clozet — one run
   * is a single analyze followed by up to six of these, and metering each batch
   * would charge a person six times for one closet. The quota is taken at
   * analyze; this ceiling exists so the batches cannot be called on their own
   * in a loop, which is the cheaper but still unbounded way to abuse a run.
   */
  const burst = await rateLimit("curate", clientIp(req), LIMITS.curate);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many requests just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  try {
    const asked = Number(body.limit);
    const limit =
      Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), 10) : PICKS_PER_BATCH;

    // Small copies of the pieces the person uploaded, so the model choosing
    // between candidates can see what it is matching rather than only read a
    // paragraph about it.
    const uploads = parseInlinePhotos(body.uploads).filter(
      (photo) => photo.data.length <= MAX_REFERENCE_BASE64_CHARS
    );

    // Read the same way analyze reads it, so a run cannot search for more of
    // what you like and then be judged on what you're missing.
    const intent: Intent = body.intent === "gaps" ? "gaps" : "similar";

    const { tasteId } = await readViewer(req);
    const [memo, prefs] = await Promise.all([
      tasteMemo(tasteId),
      tasteId ? readPreferences(tasteId).catch(() => ({})) : Promise.resolve({}),
    ]);

    const curation = await curate(
      parsedProfile.data,
      candidates,
      memo,
      limit,
      uploads,
      intent,
      prefs
    );
    return NextResponse.json(
      { items: curation.items, notes: curation.notes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
