import { NextResponse } from "next/server";
import { shop } from "@/lib/sources";

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
    const result = await shop(queries.slice(0, MAX_QUERIES), { min, max });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
