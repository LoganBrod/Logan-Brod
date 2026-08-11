import { NextResponse } from "next/server";
import { limitMessage, limitsFor } from "@/lib/plans";
import { redisConfigured } from "@/lib/redis";
import { readViewer } from "@/lib/viewer";
import {
  MAX_QUERIES_PER_WATCH,
  addWatch,
  readWatches,
  removeWatch,
  updateWatch,
} from "@/lib/watches";

export const dynamic = "force-dynamic";

/** GET /api/watches — the standing searches, and whether more are allowed. */
export async function GET(req: Request) {
  const { owner, plan, user } = await readViewer(req);

  if (!redisConfigured()) {
    return NextResponse.json(
      { configured: false, watches: [], limit: 0, plan },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const watches = await readWatches(owner);
  return NextResponse.json(
    {
      configured: true,
      plan,
      limit: limitsFor(plan).watches,
      // Without an address there's nowhere to send findings, which changes what
      // the UI should promise.
      canEmail: Boolean(user),
      watches,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** POST /api/watches — start watching for something. */
export async function POST(req: Request) {
  const { owner, plan } = await readViewer(req);
  if (!owner) {
    return NextResponse.json({ error: "Nothing identifies this browser yet." }, { status: 401 });
  }

  let body: { name?: unknown; queries?: unknown; range?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 1)
    : [];
  if (!queries.length) {
    return NextResponse.json({ error: "A watch needs something to look for." }, { status: 400 });
  }

  const range = body.range as { min?: unknown; max?: unknown } | undefined;
  const min = Number(range?.min);
  const max = Number(range?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return NextResponse.json({ error: "A watch needs a price range." }, { status: 400 });
  }

  // Watches are the membership feature, so the limit is the plan itself rather
  // than a monthly count — free is zero, and that's the pitch.
  const cap = limitsFor(plan).watches;
  const existing = await readWatches(owner);
  if (existing.length >= cap) {
    return NextResponse.json({ error: limitMessage("watches", plan), plan }, { status: 402 });
  }

  try {
    const watch = await addWatch(owner, {
      name: typeof body.name === "string" ? body.name : "",
      queries: queries.slice(0, MAX_QUERIES_PER_WATCH),
      range: { min, max },
    });
    return NextResponse.json({ ok: true, watch }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start that watch.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** PATCH /api/watches — pause, resume, or rename. */
export async function PATCH(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return NextResponse.json({ error: "Not yours." }, { status: 401 });

  let body: { id?: unknown; paused?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which watch?" }, { status: 400 });

  const watch = await updateWatch(owner, id, {
    ...(typeof body.paused === "boolean" ? { paused: body.paused } : {}),
    ...(typeof body.name === "string" ? { name: body.name.trim().slice(0, 60) } : {}),
  });

  if (!watch) return NextResponse.json({ error: "That watch isn't one of yours." }, { status: 404 });
  return NextResponse.json({ ok: true, watch }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/watches?id=… — stop watching. */
export async function DELETE(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return NextResponse.json({ error: "Not yours." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const removed = await removeWatch(owner, id);
  if (!removed) {
    return NextResponse.json({ error: "That watch isn't one of yours." }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
