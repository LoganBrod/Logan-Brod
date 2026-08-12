import { NextResponse } from "next/server";
import { readCloset } from "@/lib/closet";
import { isOwned, readLibrary } from "@/lib/library";
import { redisConfigured } from "@/lib/redis";
import {
  cleanDisplayName,
  decorate,
  isPublished,
  publish,
  readFeed,
  readLiked,
  setLike,
  unpublish,
} from "@/lib/social";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const no = (error: string, status: number) => NextResponse.json({ error }, { status });
const ok = (body: unknown) =>
  NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

/** GET /api/social — the feed, with this person's likes marked. */
export async function GET(req: Request) {
  const { owner, user } = await readViewer(req);

  if (!redisConfigured()) {
    return ok({ configured: false, closets: [], yours: [], mine: [] });
  }

  const [feed, liked, library] = await Promise.all([
    readFeed(),
    readLiked(owner),
    readLibrary(owner),
  ]);

  return ok({
    configured: true,
    // A name to publish under. Suggested, never assumed — the local part of an
    // email is a reasonable guess and a terrible default to apply silently.
    suggestedName: user?.email ? user.email.split("@")[0] : "",
    closets: decorate(feed, liked),
    // Which of this person's own closets are already out there, so the publish
    // control can read "Published" rather than offering it twice.
    mine: library.filter((entry) => isPublished(feed, entry.code)).map((entry) => entry.code),
    // Only kept closets can be published; see POST.
    yours: library.filter((entry) => entry.keptAt).map((entry) => ({
      code: entry.code,
      name: entry.name ?? "Untitled",
      itemCount: entry.itemCount,
    })),
  });
}

/**
 * POST /api/social — publish one of your closets.
 *
 * Only a *kept* closet can be published. An ordinary run expires after ninety
 * days, and a feed full of dead links is worse than a short feed — keeping is
 * already the gesture that says "this one mattered", so it's the right gate.
 */
export async function POST(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return no("Nothing identifies this browser yet.", 401);
  if (!redisConfigured()) return no("Sharing needs storage configured.", 503);

  let body: { code?: unknown; by?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return no("Body must be JSON.", 400);
  }

  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!code) return no("Which closet?", 400);

  if (!(await isOwned(owner, code))) return no("That closet isn't one of yours.", 403);

  const library = await readLibrary(owner);
  const entry = library.find((item) => item.code === code);
  if (!entry?.keptAt) {
    return no("Keep a closet before you publish it, so the link doesn't expire under it.", 409);
  }

  const closet = await readCloset(code).catch(() => null);
  if (!closet) return no("That closet has expired.", 404);

  const by = cleanDisplayName(body.by);
  if (!by) return no("Choose a name to publish under.", 400);

  const published = await publish({
    code,
    name: entry.name ?? "Untitled",
    by,
    itemCount: entry.itemCount,
    range: entry.range,
    preview: closet.items
      .map((item) => item.imageUrl)
      .filter((url): url is string => Boolean(url))
      .slice(0, 4),
  });

  if (!published) return no("Couldn't publish that closet.", 502);
  return ok({ ok: true, closet: published });
}

/** PATCH /api/social — like or unlike. */
export async function PATCH(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return no("Nothing identifies this browser yet.", 401);

  let body: { code?: unknown; liked?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return no("Body must be JSON.", 400);
  }

  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!code) return no("Which closet?", 400);
  if (typeof body.liked !== "boolean") return no("Liked must be true or false.", 400);

  const result = await setLike(owner, code, body.liked);
  if (!result) return no("Couldn't record that.", 502);
  return ok({ ok: true, ...result });
}

/** DELETE /api/social?code=… — take a closet back out of the feed. */
export async function DELETE(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return no("Nothing identifies this browser yet.", 401);

  const code = (new URL(req.url).searchParams.get("code") ?? "").toUpperCase();
  if (!(await isOwned(owner, code))) return no("That closet isn't one of yours.", 403);

  const removed = await unpublish(code);
  if (!removed) return no("That closet isn't published.", 404);
  return ok({ ok: true });
}
