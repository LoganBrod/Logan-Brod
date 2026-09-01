// "Is this any good?"
//
// One piece, one straight answer, against everything the app knows about the
// person. This is the highest-frequency question the product can answer — people
// ask it standing in a shop or halfway through a listing, far more often than
// they sit down to build a whole closet — and it costs one vision call.
//
// The tone is the point. A stylist who says "great choice!" to everything is
// worthless, so the prompt below is explicit that a no is the useful answer more
// often than a yes, and the schema refuses an empty list of reservations on
// anything that isn't an outright yes.

import { publicUrl, safeFetch } from "./safeFetch";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { JudgementSchema, type Judgement } from "./schemas";
import { imageSize, meter } from "./meter";
import { fetchThumbnail, type InlineImage } from "./thumbnails";

const SYSTEM = `You are telling one man whether a specific garment is worth buying, for him.

You can see the photograph. It is the evidence; the title and the price are claims. Judge the thing in the picture.

Be useful, which mostly means being willing to say no. A stylist who approves of everything is worth nothing, and the person asking has already half-decided — your value is entirely in the cases where you disagree with them. Say no when it's a no.

Weigh, in this order: does it suit the way this person actually dresses; will it fit them; is the price fair for this piece in this condition. A beautiful garment that clashes with everything they own is a bad buy, and so is the right garment two sizes wrong.

Where you're told what they've responded to before, that outranks your own read — it is the only direct evidence about this person that exists.

Never pad. If there is nothing against a piece, say so in one short line rather than inventing a reservation; if there is nothing for it, don't manufacture praise. Write to him, plainly, second person, no preamble.`;

export interface JudgeInput {
  /** The photo, already fetched. */
  image: InlineImage;
  /** Whatever is known about the listing. All optional — a photo alone is enough. */
  title?: string;
  price?: number;
  condition?: string;
  source?: string;
  /** From lib/taste.ts. Sizes, statistics, and past verdicts. */
  memo?: string | null;
  /** The band they said they shop in, if they've said. */
  range?: { min: number; max: number } | null;
}

export async function judge(input: JudgeInput): Promise<Judgement> {
  const facts = [
    input.title ? `Title: ${input.title}` : null,
    typeof input.price === "number" ? `Asking price: $${input.price.toFixed(2)}` : null,
    input.condition ? `Condition: ${input.condition}` : null,
    input.source ? `Listed on: ${input.source}` : null,
    input.range ? `They usually spend $${input.range.min}-$${input.range.max} a piece.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await anthropic().messages.parse({
    model: MODELS.judge,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      // One image and a short answer. High effort buys nothing here and the
      // whole value of this feature is that it answers while you're standing
      // in front of the thing.
      effort: "medium",
      format: zodOutputFormat(JudgementSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.image.mediaType as "image/jpeg",
              data: input.image.data,
            },
          },
          {
            type: "text",
            text: `Should I buy this?\n\n${facts || "No details beyond the photo."}${
              input.memo ? `\n\n${input.memo}` : ""
            }`,
          },
        ],
      },
    ],
  });

  assertNotRefused(message, "judgement");

  meter({
    op: "judge",
    model: MODELS.judge,
    usage: message.usage,
    images: [imageSize(input.image.data)],
  });
  return requireParsed(message.parsed_output, "judgement") as Judgement;
}

// ------------------------------------------------------------------- links

/**
 * Refuse anything that isn't a public web page.
 *
 * This endpoint fetches a URL a stranger supplied, which is the classic way to
 * turn a server into a probe for whatever is on its own network. Public
 * hostnames only, and only over http(s) — the numeric ranges below are the ones
 * that never belong to a shopping site.
 */
export function fetchableUrl(raw: string): URL | null {
  // The written-form check lives in lib/safeFetch.ts now, alongside the DNS
  // and redirect checks that a hostname test alone was missing. This stays as
  // the name the routes import, so nothing else had to move.
  return publicUrl(raw);
}

export interface LinkPreview {
  title?: string;
  price?: number;
  imageUrl?: string;
}

/** Pull a title, a price and an image out of a listing page's own metadata. */
export function readMetadata(html: string): LinkPreview {
  const meta = (...names: string[]): string | undefined => {
    for (const name of names) {
      const pattern = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
      const reversed = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
        "i"
      );
      const found = html.match(pattern)?.[1] ?? html.match(reversed)?.[1];
      if (found) return decodeEntities(found);
    }
    return undefined;
  };

  const rawPrice =
    meta("product:price:amount", "og:price:amount", "twitter:data1") ??
    html.match(/"price"\s*:\s*"?([\d.]+)"?/i)?.[1];
  const price = Number(String(rawPrice ?? "").replace(/[^\d.]/g, ""));

  return {
    title:
      meta("og:title", "twitter:title") ??
      (decodeEntities(html.match(/<title>([^<]+)</i)?.[1] ?? "") || undefined),
    imageUrl: meta("og:image", "twitter:image", "og:image:secure_url"),
    price: Number.isFinite(price) && price > 0 ? price : undefined,
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Fetch a listing page and pull out enough to judge it. Never throws. */
export async function previewLink(
  raw: string
): Promise<(LinkPreview & { image: InlineImage }) | null> {
  const url = fetchableUrl(raw);
  if (!url) return null;

  try {
    // Through safeFetch: the pasted link is the one URL in this app that a
    // person chose outright, and redirects are re-checked at every hop.
    const res = await safeFetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: {
        // Some listing pages serve a stub to anything that doesn't look like a
        // browser, and a stub has no og:image.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res?.ok) return null;

    // Only the head is needed, and a whole product page can be megabytes.
    const html = (await res.text()).slice(0, 300_000);
    const preview = readMetadata(html);
    if (!preview.imageUrl) return null;

    const image = await fetchThumbnail(new URL(preview.imageUrl, url).toString());
    return image ? { ...preview, image } : null;
  } catch {
    return null;
  }
}
