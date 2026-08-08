import { NextResponse } from "next/server";
import { redisConfigured } from "@/lib/redis";
import {
  TASTE_COOKIE,
  TASTE_TTL_SECONDS,
  newTasteId,
  readTasteId,
  readVotes,
  recordVote,
  renderMemo,
  type Verdict,
} from "@/lib/taste";

export const dynamic = "force-dynamic";

function cookieHeader(id: string): string {
  // httpOnly: nothing in the page needs to read this, and it's the key to a
  // record of what someone likes.
  return [
    `${TASTE_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TASTE_TTL_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * GET /api/taste — what this browser has voted on, and whether voting works at
 * all. The UI hides the vote control when `configured` is false rather than
 * offering a button that can only fail.
 *
 * Also mints the id cookie, so by the time anyone presses yes there is already
 * somewhere to put it.
 */
export async function GET(req: Request) {
  const configured = redisConfigured();
  const existing = readTasteId(req.headers.get("cookie"));
  const id = existing ?? newTasteId();

  let votes: Awaited<ReturnType<typeof readVotes>> = [];
  if (configured) {
    votes = await readVotes(id).catch(() => []);
  }

  const verdicts: Record<string, Verdict> = {};
  for (const vote of votes) {
    // Newest first, so the first verdict seen for a title is the current one.
    const dedupe = vote.title?.trim().toLowerCase();
    if (dedupe && !(dedupe in verdicts)) verdicts[dedupe] = vote.verdict;
  }

  return NextResponse.json(
    { configured, count: votes.length, verdicts, memo: renderMemo(votes) },
    {
      headers: {
        "Set-Cookie": cookieHeader(id),
        "Cache-Control": "no-store",
      },
    }
  );
}

/** POST /api/taste — record one yes or no. */
export async function POST(req: Request) {
  // 501 rather than 502: this is an optional feature that isn't set up, which
  // the client treats as "voting is off", not as breakage.
  if (!redisConfigured()) {
    return NextResponse.json(
      {
        error:
          "Feedback isn't set up. Add Upstash Redis (Vercel → Storage → Marketplace) to remember what you like.",
      },
      { status: 501 }
    );
  }

  let body: { title?: unknown; verdict?: unknown; source?: unknown; price?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const verdict = body.verdict === "yes" || body.verdict === "no" ? body.verdict : null;
  if (!title || !verdict) {
    return NextResponse.json(
      { error: "title and verdict ('yes' or 'no') are required." },
      { status: 400 }
    );
  }

  const id = readTasteId(req.headers.get("cookie")) ?? newTasteId();

  try {
    await recordVote(id, {
      title,
      verdict,
      at: new Date().toISOString(),
      source: typeof body.source === "string" ? body.source : undefined,
      price: Number.isFinite(Number(body.price)) ? Number(body.price) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": cookieHeader(id), "Cache-Control": "no-store" } }
  );
}
