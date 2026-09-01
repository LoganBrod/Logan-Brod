// Product photos, fetched here rather than by the model.
//
// Curation used to hand the API image URLs and let it fetch them. That works
// for eBay and fails for Google Shopping: the API's fetcher honours robots.txt,
// and Google's thumbnail CDN disallows it, so every retail listing came back as
// "This URL is disallowed by the website's robots.txt file" — and because the
// whole message is rejected together, one unfetchable photo took the other
// fifteen in its batch with it.
//
// So the app fetches them itself and sends the bytes inline, exactly as the
// upload path already does. These are the same images the page loads into
// `<img>` tags a moment later; nothing is being crawled, indexed, or read that
// a visitor's browser doesn't read anyway.
//
// The important property is that a photo that can't be fetched is *one lost
// candidate*, never a lost batch.

import { safeFetch } from "./safeFetch";
import type { ProductListing } from "./sources/types";

/** What the API will decode. Anything else is not worth the round trip. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Per-image timeout. These are thumbnails on CDNs — one that hasn't answered in
 * four seconds isn't going to, and sixteen of them are in flight at once.
 */
const TIMEOUT_MS = 4000;

/** Thumbnails run tens of kilobytes. Anything past this is a full-size photo. */
const MAX_BYTES = 3 * 1024 * 1024;

export interface InlineImage {
  data: string;
  mediaType: string;
}

/** Fetch one photo, or null. Never throws — a missing photo is a normal outcome. */
export type FetchOptions = Parameters<typeof safeFetch>[2];

export async function fetchThumbnail(
  url: string,
  /** Forwarded to safeFetch. Only tests pass this; see the note there. */
  options?: FetchOptions
): Promise<InlineImage | null> {
  try {
    // Through safeFetch, which resolves the host and re-checks every redirect
    // hop. These URLs come from marketplaces and from the /api/image proxy, so
    // they are chosen by other people and this is an SSRF surface.
    const res = await safeFetch(
      url,
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: {
          // Some CDNs serve a placeholder to clients that don't look like a
          // browser, which would waste a curation slot on a grey square.
          Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
        },
      },
      options
    );
    if (!res?.ok) return null;

    const mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(mediaType)) return null;

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    // Checked again after reading: content-length is a claim, not a guarantee.
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return null;

    return { data: Buffer.from(bytes).toString("base64"), mediaType };
  } catch {
    return null;
  }
}

/**
 * Fetch every candidate's photo at once, and return only the ones that arrived.
 *
 * In parallel because they're independent and the whole batch waits on the
 * slowest one either way. The listings come back in their original order, so
 * whatever ranking got them here survives.
 */
export async function withThumbnails(
  listings: ProductListing[],
  options?: FetchOptions
): Promise<Array<{ listing: ProductListing; image: InlineImage }>> {
  const fetched = await Promise.all(
    listings.map(async (listing) => {
      if (!listing.imageUrl) return null;
      const image = await fetchThumbnail(listing.imageUrl, options);
      return image ? { listing, image } : null;
    })
  );

  return fetched.filter((entry): entry is { listing: ProductListing; image: InlineImage } =>
    entry !== null
  );
}
