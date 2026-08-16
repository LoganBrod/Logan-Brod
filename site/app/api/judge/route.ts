import { NextResponse } from "next/server";
import { describeApiError } from "@/lib/anthropic";
import { judge, previewLink } from "@/lib/judge";
import { allowance, limitMessage, spend } from "@/lib/plans";
import { tasteMemo } from "@/lib/taste";
import { fetchThumbnail } from "@/lib/thumbnails";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { identify } from "@/lib/viewer";

export const dynamic = "force-dynamic";
// A page fetch, an image fetch, and one vision call.
export const maxDuration = 60;

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Same ceiling as the upload path — the browser downscales before sending. */
const MAX_BASE64 = 8 * 1024 * 1024;

/**
 * POST /api/judge — is this one piece any good?
 *
 *   { url }                         a listing anywhere; the page's own metadata is read
 *   { photo: { data, mediaType } }  a photo taken in a shop
 *
 * Either may carry `title`, `price` and `condition` to fill in what a page
 * didn't say.
 */
export async function POST(req: Request) {
  let body: {
    url?: unknown;
    photo?: unknown;
    title?: unknown;
    price?: unknown;
    condition?: unknown;
    range?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const burst = await rateLimit("judge", clientIp(req), LIMITS.judge);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many questions just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  // identify rather than readViewer: a first-time visitor has no cookie, and a
  // meter with no id now refuses rather than waving them through.
  const viewer = await identify(req);
  const room = await allowance(viewer.id, viewer.plan, "judgements");
  if (!room.allowed) {
    return NextResponse.json(
      { error: limitMessage("judgements", room.plan), limit: room },
      { status: 402 }
    );
  }

  // Gather the piece first, from whichever direction it arrived.
  let image: Awaited<ReturnType<typeof fetchThumbnail>> = null;
  let title = typeof body.title === "string" ? body.title : undefined;
  let price = Number.isFinite(Number(body.price)) ? Number(body.price) : undefined;
  let source: string | undefined;

  if (typeof body.url === "string" && body.url.trim()) {
    const preview = await previewLink(body.url);
    if (!preview) {
      return NextResponse.json(
        {
          error:
            "Couldn't read that page. Some sites block it — save the photo and send that instead.",
        },
        { status: 422 }
      );
    }
    image = preview.image;
    title = title ?? preview.title;
    price = price ?? preview.price;
    try {
      source = new URL(body.url).hostname.replace(/^www\./, "");
    } catch {
      source = undefined;
    }
  } else {
    const photo = body.photo as { data?: unknown; mediaType?: unknown } | undefined;
    if (
      !photo ||
      typeof photo.data !== "string" ||
      typeof photo.mediaType !== "string" ||
      !ALLOWED_MEDIA.includes(photo.mediaType)
    ) {
      return NextResponse.json(
        { error: "Send a link, or a photo as { data, mediaType }." },
        { status: 400 }
      );
    }
    if (photo.data.length > MAX_BASE64) {
      return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
    }
    image = { data: photo.data, mediaType: photo.mediaType };
  }

  const range = body.range as { min?: unknown; max?: unknown } | undefined;
  const min = Number(range?.min);
  const max = Number(range?.max);

  try {
    const memo = await tasteMemo(viewer.tasteId);
    const judgement = await judge({
      image,
      title,
      price,
      condition: typeof body.condition === "string" ? body.condition : undefined,
      source,
      memo,
      range: Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null,
    });

    // Counted after it worked, so a failure never costs someone one of three.
    await spend(viewer.id, "judgements");

    return NextResponse.json(
      { judgement, piece: { title, price, source } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
