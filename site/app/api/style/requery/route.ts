import { NextResponse } from "next/server";
import { describeApiError } from "@/lib/anthropic";
import { namedMakers, renderPreferences } from "@/lib/preferences";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_REQUERIES, rewriteQueries, type TriedQuery } from "@/lib/requery";
import { StyleProfileSchema } from "@/lib/schemas";
import { readPreferences } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How much of the judge's notes is worth sending. Past this it is repetition. */
const MAX_NOTES_CHARS = 1200;

/**
 * POST /api/style/requery — replacement searches for a run that came back thin.
 *
 * Shares the analyze bucket: it is a model call that writes queries, and a
 * caller who can exhaust one can exhaust the other. It does not spend a closet
 * from the monthly allowance, because it is part of the run that already did.
 */
export async function POST(req: Request) {
  let body: {
    profile?: unknown;
    tried?: unknown;
    min?: unknown;
    max?: unknown;
    notes?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const profile = StyleProfileSchema.safeParse(body.profile);
  if (!profile.success) {
    return NextResponse.json({ error: "profile is missing or malformed." }, { status: 400 });
  }

  const min = Number(body.min);
  const max = Number(body.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return NextResponse.json({ error: "min and max must be numbers with 0 <= min < max." }, { status: 400 });
  }

  const tried: TriedQuery[] = (Array.isArray(body.tried) ? body.tried : [])
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
    .map((t) => ({
      query: typeof t.query === "string" ? t.query.trim().slice(0, 120) : "",
      slot: typeof t.slot === "string" ? t.slot.slice(0, 20) : undefined,
      found: Math.max(0, Math.round(Number(t.found)) || 0),
      viewed: Math.max(0, Math.round(Number(t.viewed)) || 0),
      picked: Math.max(0, Math.round(Number(t.picked)) || 0),
    }))
    .filter((t) => t.query)
    .slice(0, 12);
  if (!tried.length) {
    return NextResponse.json({ error: "tried must list the first pass's queries." }, { status: 400 });
  }

  const burst = await rateLimit("analyze", clientIp(req), LIMITS.analyze);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many requests just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  try {
    const { tasteId } = await readViewer(req);
    const prefs = tasteId ? await readPreferences(tasteId).catch(() => ({})) : {};
    const notes = typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_CHARS) : "";

    const searchQueries = await rewriteQueries(
      profile.data,
      tried,
      { min, max },
      notes,
      renderPreferences(prefs, "reader"),
      namedMakers(prefs)
    );

    return NextResponse.json(
      { searchQueries: searchQueries.slice(0, MAX_REQUERIES) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
