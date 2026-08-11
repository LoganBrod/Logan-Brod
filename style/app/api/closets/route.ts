import { NextResponse } from "next/server";
import { isValidCode, normalizeCode } from "@/lib/closet";
import {
  forgetCloset,
  keepCloset,
  readLibrary,
  releaseCloset,
  type LibraryEntry,
} from "@/lib/library";
import { allowance, limitMessage, spend } from "@/lib/plans";
import { redisConfigured } from "@/lib/redis";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * GET /api/closets — every closet this person has built.
 *
 * Kept ones first, then the rest newest-first, which is the order the page
 * shows them in and the order that matters: a kept closet was chosen, a run was
 * merely made.
 */
export async function GET(req: Request) {
  const { owner, user } = await readViewer(req);

  if (!redisConfigured()) {
    return NextResponse.json(
      { configured: false, signedIn: false, closets: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const entries = await readLibrary(owner);
  const closets = [...entries].sort((a, b) => {
    if (Boolean(a.keptAt) !== Boolean(b.keptAt)) return a.keptAt ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json(
    {
      configured: true,
      signedIn: Boolean(user),
      email: user?.email ?? null,
      closets,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** PATCH /api/closets — keep a closet under a name, or let it go again. */
export async function PATCH(req: Request) {
  const { owner, plan, meterId } = await readViewer(req);
  if (!owner) {
    return NextResponse.json({ error: "Nothing identifies this browser yet." }, { status: 401 });
  }

  let body: { code?: unknown; name?: unknown; keep?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "That isn't a closet code." }, { status: 400 });
  }

  const keep = body.keep !== false;
  const name = typeof body.name === "string" ? body.name : "";

  if (keep && !name.trim()) {
    return NextResponse.json({ error: "Give it a name so you'll recognise it." }, { status: 400 });
  }

  // Keeping is the metered action; letting one go always works, so nobody is
  // ever stuck at their limit with no way down.
  if (keep) {
    const already = await readLibrary(owner);
    const isNew = !already.find((entry) => entry.code === code)?.keptAt;
    if (isNew) {
      const room = await allowance(meterId, plan, "keeps");
      if (!room.allowed) {
        return NextResponse.json(
          { error: limitMessage("keeps", room.plan), limit: room },
          { status: 402 }
        );
      }
    }
  }

  try {
    // Ownership is enforced by the library itself: keep and release only touch
    // codes already in this owner's list, so knowing a code is not enough to
    // pin someone else's closet open forever.
    const entry: LibraryEntry | null = keep
      ? await keepCloset(owner, code, name)
      : await releaseCloset(owner, code);

    if (!entry) {
      return NextResponse.json({ error: "That closet isn't one of yours." }, { status: 404 });
    }
    if (keep) await spend(meterId, "keeps");
    return NextResponse.json({ ok: true, closet: entry }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't update that closet.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * DELETE /api/closets?code=ABC234 — take a closet off the list.
 *
 * The closet itself survives, and anyone holding its code still has it. That's
 * the bargain the code has always made; this only means "stop showing me this".
 */
export async function DELETE(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) {
    return NextResponse.json({ error: "Nothing identifies this browser yet." }, { status: 401 });
  }

  const code = normalizeCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "That isn't a closet code." }, { status: 400 });
  }

  try {
    const removed = await forgetCloset(owner, code);
    if (!removed) {
      return NextResponse.json({ error: "That closet isn't one of yours." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't remove that closet.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
