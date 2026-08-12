import { NextResponse } from "next/server";
import { describeApiError } from "@/lib/anthropic";
import { adviseFit, forgetLookup, readHistory, recordLookup } from "@/lib/fit";
import { allowance, limitMessage, spend } from "@/lib/plans";
import { newTasteId, readSizes, readTasteId, tasteCookie, writeSizes } from "@/lib/taste";
import { hasSizes } from "@/lib/sizing";
import { readViewer } from "@/lib/viewer";
import { webSearchConfigured } from "@/lib/websearch";

export const dynamic = "force-dynamic";
// A search, up to three page fetches, and a high-effort pass over all of them.
export const maxDuration = 120;

const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Every response here can mint the browser id, the same way `/api/taste` does.
 *
 * This page is reachable directly from the nav, so it is often the first thing
 * a new visitor touches — and without this it was: load the page, fill in your
 * measurements, press save, get a 401, because nothing had ever identified the
 * browser. An id costs nothing and has to exist *before* anyone presses a
 * button, not after.
 */
function ok(body: unknown, mint?: string | null) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      ...(mint ? { "Set-Cookie": tasteCookie(mint) } : {}),
    },
  });
}

/** The id to file this person's sizes under, minting one if this browser has none. */
async function identify(req: Request) {
  const viewer = await readViewer(req);
  const existing = readTasteId(req.headers.get("cookie"));
  // An account's id wins; otherwise the browser's, existing or new.
  const browserId = existing ?? newTasteId();
  return {
    ...viewer,
    id: viewer.tasteId ?? browserId,
    /** Set only when a cookie needs writing back, so responses stay clean. */
    mint: existing ? null : browserId,
  };
}

/** GET /api/fit — the measurements on file, and every brand checked so far. */
export async function GET(req: Request) {
  const { id, plan, mint } = await identify(req);
  const [sizes, history] = await Promise.all([readSizes(id), readHistory(id)]);

  return ok(
    {
      configured: webSearchConfigured(),
      plan,
      sizes,
      hasSizes: hasSizes(sizes),
      history,
    },
    mint
  );
}

/** PUT /api/fit — save measurements. Separate from a lookup, which costs money. */
export async function PUT(req: Request) {
  const { id, mint } = await identify(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return no("Body must be JSON.", 400);
  }

  const sizes = await writeSizes(id, body);
  return ok({ ok: true, sizes, hasSizes: hasSizes(sizes) }, mint);
}

/**
 * POST /api/fit — look up how a brand sizes.
 *
 * Metered against judgements rather than a meter of its own. Both are "one
 * question about one thing I'm looking at right now", both cost a model call,
 * and a person who has used their three judgements has had the free taste of
 * exactly this kind of answer. A second meter would be more precise and much
 * harder to explain.
 */
export async function POST(req: Request) {
  const { id, plan, meterId, mint } = await identify(req);

  if (!webSearchConfigured()) {
    return no("Brand sizing isn't configured on this deployment.", 503);
  }

  let body: { brand?: unknown; category?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return no("Body must be JSON.", 400);
  }

  const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 40) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 30) : "";
  if (!brand) return no("Which brand?", 400);
  if (!category) return no("Which kind of garment?", 400);

  // Metered against the account when there is one, and against the browser
  // otherwise — the same identity that owns the measurements being compared.
  const meter = meterId ?? id;
  const quota = await allowance(meter, plan, "judgements");
  if (!quota.allowed) return NextResponse.json({ error: limitMessage("judgements", plan) }, { status: 402 });

  const sizes = await readSizes(id);
  if (!hasSizes(sizes)) {
    return no("Fill in at least one measurement first — there's nothing to compare against.", 409);
  }

  try {
    const result = await adviseFit({ brand, category, sizes });

    // Counted after the answer exists, and the record written before returning
    // so a lookup is never paid for twice.
    await Promise.all([
      spend(meter, "judgements"),
      recordLookup(id, {
        brand,
        category,
        advice: result.advice,
        checkedAt: new Date().toISOString(),
      }),
    ]);

    return ok({ ok: true, ...result }, mint);
  } catch (err) {
    return no(describeApiError(err), 502);
  }
}

/** DELETE /api/fit?brand=…&category=… — forget one lookup. */
export async function DELETE(req: Request) {
  const { id } = await identify(req);

  const params = new URL(req.url).searchParams;
  const dropped = await forgetLookup(id, params.get("brand") ?? "", params.get("category") ?? "");
  if (!dropped) return no("No such lookup.", 404);
  return ok({ ok: true });
}
