import { NextResponse } from "next/server";
import { redisConfigured } from "@/lib/redis";
import {
  SIGNALS,
  TASTE_COOKIE,
  TASTE_TTL_SECONDS,
  newTasteId,
  readSizes,
  readTasteId,
  readVotes,
  recordEvents,
  recordVote,
  renderMemo,
  writeSizes,
  type ItemAttributes,
  type Signal,
  type TasteEvent,
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
  let sizes = {};
  if (configured) {
    [votes, sizes] = await Promise.all([
      readVotes(id).catch(() => []),
      readSizes(id).catch(() => ({})),
    ]);
  }

  const verdicts: Record<string, Verdict> = {};
  for (const vote of votes) {
    // Newest first, so the first verdict seen for a title is the current one.
    const dedupe = vote.title?.trim().toLowerCase();
    if (dedupe && !(dedupe in verdicts)) verdicts[dedupe] = vote.verdict;
  }

  return NextResponse.json(
    { configured, count: votes.length, verdicts, sizes, memo: renderMemo(votes) },
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

  let body: {
    title?: unknown;
    verdict?: unknown;
    source?: unknown;
    price?: unknown;
    attrs?: unknown;
    events?: unknown;
    sizes?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const id = readTasteId(req.headers.get("cookie")) ?? newTasteId();
  const respond = (payload: object) =>
    NextResponse.json(payload, {
      headers: { "Set-Cookie": cookieHeader(id), "Cache-Control": "no-store" },
    });

  try {
    // Sizes. Sent on their own, and echoed back cleaned so the form shows what
    // was actually stored rather than what was typed.
    if (body.sizes !== undefined) {
      return respond({ ok: true, sizes: await writeSizes(id, body.sizes) });
    }

    // A batch of impressions and clicks. One request per user action, because
    // eight pieces hanging at once would otherwise be eight read-modify-writes
    // racing each other over the same counters.
    if (body.events !== undefined) {
      const events = parseEvents(body.events);
      if (!events.length) {
        return NextResponse.json({ error: "events must be a non-empty array." }, { status: 400 });
      }
      await recordEvents(id, events);
      return respond({ ok: true, recorded: events.length });
    }

    // A yes or a no. Recorded twice on purpose: as a title in the verdict list,
    // which is what the memo quotes back, and as a signal against this piece's
    // attributes, which is what the statistics learn from.
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const verdict = body.verdict === "yes" || body.verdict === "no" ? body.verdict : null;
    if (!title || !verdict) {
      return NextResponse.json(
        { error: "title and verdict ('yes' or 'no') are required." },
        { status: 400 }
      );
    }

    const attrs = parseAttrs(body.attrs);
    const source = typeof body.source === "string" ? body.source : undefined;
    const price = Number.isFinite(Number(body.price)) ? Number(body.price) : undefined;

    await recordVote(id, { title, verdict, at: new Date().toISOString(), source, price });
    if (attrs) await recordEvents(id, [{ title, signal: verdict, attrs, source, price }]);

    return respond({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Attribute values come from a model and end up as storage keys, so they're bounded here. */
function parseAttrs(raw: unknown): ItemAttributes | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : undefined;

  const attrs: ItemAttributes = {
    category: text(input.category),
    brand: text(input.brand),
    material: text(input.material),
    colour: text(input.colour),
  };

  return Object.values(attrs).some(Boolean) ? attrs : undefined;
}

/** One closet's worth at most — anything larger is a client bug, not a user. */
const MAX_EVENTS = 40;

function parseEvents(raw: unknown): TasteEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_EVENTS)
    .map((entry): TasteEvent | null => {
      if (!entry || typeof entry !== "object") return null;
      const event = entry as Record<string, unknown>;
      const title = typeof event.title === "string" ? event.title.trim() : "";
      const signal = event.signal as Signal;
      if (!title || !SIGNALS.includes(signal)) return null;

      const attrs = parseAttrs(event.attrs);
      // An event with no attributes has nothing to count against.
      if (!attrs) return null;

      return {
        title,
        signal,
        attrs,
        source: typeof event.source === "string" ? event.source : undefined,
        price: Number.isFinite(Number(event.price)) ? Number(event.price) : undefined,
      };
    })
    .filter((event): event is TasteEvent => event !== null);
}
