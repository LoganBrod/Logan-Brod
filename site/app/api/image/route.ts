import { NextResponse } from "next/server";
import { fetchableUrl } from "@/lib/judge";
import { fetchThumbnail } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";

/**
 * GET /api/image?url=… — one product photo, served from our own origin.
 *
 * This exists for exactly one reason: the share card is drawn in a `<canvas>`,
 * and drawing a cross-origin image into a canvas taints it, after which
 * `toBlob` throws a SecurityError and there is no picture to share. eBay's and
 * Google's thumbnail CDNs don't send permissive CORS headers, so the bytes have
 * to arrive same-origin.
 *
 * It is an image proxy, which is a thing worth being careful about, so it is a
 * narrow one: `fetchableUrl` refuses anything that isn't public http(s) —
 * loopback, link-local, and private ranges are all rejected — and
 * `fetchThumbnail` allows four image content types, caps the body at 3MB, and
 * times out in four seconds. Nothing here reaches anything a visitor's browser
 * doesn't already fetch directly when the page renders.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  if (!fetchableUrl(raw)) {
    return NextResponse.json({ error: "Not a fetchable image URL." }, { status: 400 });
  }

  const image = await fetchThumbnail(raw);
  if (!image) return NextResponse.json({ error: "Couldn't fetch that image." }, { status: 502 });

  return new NextResponse(Buffer.from(image.data, "base64"), {
    headers: {
      "Content-Type": image.mediaType,
      // These are third-party thumbnails that don't change under their URL.
      // Cached at the edge so a share card drawn twice costs one fetch.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      // Belt and braces: never let a proxied response be sniffed into script.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
