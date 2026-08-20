// What each model call actually cost.
//
// Off unless COST_LOG=1. This exists because pricing the product was being
// done on estimates, and an estimate of token spend is worth very little —
// thinking tokens are billed as output, output is five times the input rate,
// and how much a model thinks is not something you can read off the source.
//
// Nothing here changes behaviour. It reads `usage` off a response that already
// exists and prints a line. It never throws: a metering bug must not be able to
// fail a run that has already been paid for.
//
// Usage:
//   COST_LOG=1 npm run dev        # then drive the app; lines go to the server console
//   COST_LOG=1 ... | grep '"cost"' | node scripts/cost-report.mjs

/**
 * USD per million tokens, by model id. Checked against the pricing page
 * 2026-08-12.
 *
 * Several jobs run on different models now (see `MODELS` in lib/anthropic.ts),
 * so a run's log lines are not all priced the same way and the totals only mean
 * anything if every id in use appears here.
 */
export const PRICES: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export function costLogging(): boolean {
  return process.env.COST_LOG === "1";
}

/**
 * The `usage` shape, kept structural rather than imported.
 *
 * The SDK ships both CJS and ESM builds, and this only ever reads four numbers
 * — a nominal type here would buy nothing and could break on an SDK bump.
 */
interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  // The SDK types the cache fields as nullable, not optional — a request with
  // no cache_control gets `null` rather than an absent key.
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Pixel dimensions of a base64 image, without decoding it.
 *
 * Reads the header only — JPEG's SOF marker, PNG's IHDR, WebP's VP8 chunk. The
 * point is to answer "what size are the images we actually send", which is the
 * question you cannot answer from the source alone because it depends on what
 * the remote CDN served.
 */
export function imageSize(base64: string): { w: number; h: number } | null {
  try {
    const buf = Buffer.from(base64.slice(0, 8192), "base64");

    // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }

    // WebP: "RIFF" .... "WEBP" "VP8 " | "VP8L" | "VP8X"
    if (buf.slice(0, 4).toString("ascii") === "RIFF") {
      const fmt = buf.slice(12, 16).toString("ascii");
      if (fmt === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
      if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }

    // JPEG: walk the segment chain to the first start-of-frame.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    // A header we can't parse is not worth failing over.
  }
  return null;
}

/** Claude bills an image at roughly (width × height) / 750 tokens. */
export function imageTokens(w: number, h: number): number {
  return Math.round((w * h) / 750);
}

export interface MeterInput {
  /** Which operation this call belongs to — "closet.analyze", "sweep.curate", … */
  op: string;
  model: string;
  usage: Usage | null | undefined;
  /** Dimensions of every image sent, in order. */
  images?: Array<{ w: number; h: number } | null>;
  /** Anything else worth having in the log line — candidate counts, brand, etc. */
  extra?: Record<string, unknown>;
}

/**
 * Print one line of accounting. Never throws.
 *
 * The line is JSON so it can be piped straight into a report rather than
 * re-parsed by eye.
 */
export function meter({ op, model, usage, images, extra }: MeterInput): void {
  if (!costLogging()) return;
  try {
    // Unknown ids fall back to the dearest model on the list, so a missing
    // price over-states the bill rather than quietly hiding one.
    const price = PRICES[model] ?? PRICES["claude-opus-5"];
    const inTok = usage?.input_tokens ?? 0;
    const outTok = usage?.output_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;

    const cost =
      (inTok / 1e6) * price.in +
      (outTok / 1e6) * price.out +
      (cacheWrite / 1e6) * price.cacheWrite +
      (cacheRead / 1e6) * price.cacheRead;

    const sized = (images ?? []).filter((d): d is { w: number; h: number } => d !== null);

    console.log(
      JSON.stringify({
        tag: "COST",
        op,
        model,
        in: inTok,
        out: outTok,
        cacheWrite,
        cacheRead,
        images: images?.length ?? 0,
        imageDims: sized.map((d) => `${d.w}x${d.h}`),
        imageTokens: sized.reduce((sum, d) => sum + imageTokens(d.w, d.h), 0),
        cost: Number(cost.toFixed(6)),
        ...extra,
      })
    );
  } catch {
    // Accounting must never be the reason a request fails.
  }
}
