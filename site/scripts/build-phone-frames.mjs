// Builds the phone-sized copy of the corridor walk.
//
// The desktop walk is 197 frames at 1400x780 — 7.2MB. That is fine over a
// broadband connection and indefensible over a phone's data plan, which is why
// the corridor used to be switched off below lg entirely. This produces a
// second set that a phone can actually afford: fewer frames, smaller, and
// harder compressed, at roughly 0.9MB for the whole walk.
//
// There is no ffmpeg or sharp in this project, so the resizing is done by the
// one image encoder that is definitely present — a browser. Playwright's
// Chromium draws each frame to a canvas and re-encodes it, which needs the
// frames to be reachable over HTTP, so a dev or production server must already
// be serving them.
//
//   npm run dev                                     # or any server on the port
//   npx playwright@1 install chromium               # not a project dependency
//   node scripts/build-phone-frames.mjs http://127.0.0.1:3000
//
// Playwright is deliberately not in package.json: this runs by hand, roughly
// never, and its output — public/frames-sm and public/garments-sm — is
// committed. Re-run it only when the source frames or cut-outs change.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3000";

/** The canonical walk, and the timeline every frame index is expressed in. */
const SOURCE_COUNT = 197;

/**
 * How many frames the phone gets.
 *
 * Evenly sampled across the whole walk rather than truncated, so the camera
 * still arrives everywhere it used to — it just takes fewer steps to get there.
 * 66 is a third of the source: chunky held one frame at a time, unnoticeable
 * against a camera this slow, and the difference between 0.9MB and 2.7MB.
 */
const COUNT = 66;

/** Wide enough for a 390px phone at 2x, once the frame's insets are taken off. */
const WIDTH = 760;
const QUALITY = 0.62;

/** Which source frame the nth phone frame is. Both ends are included. */
export function sourceIndex(n) {
  return Math.round((n * (SOURCE_COUNT - 1)) / (COUNT - 1));
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "frames-sm");

const srcPath = (i) => `/frames/f_${String(i + 1).padStart(4, "0")}.jpg`;
const outName = (n) => `f_${String(n + 1).padStart(4, "0")}.jpg`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let total = 0;
const BATCH = 10;

for (let start = 0; start < COUNT; start += BATCH) {
  const batch = [];
  for (let n = start; n < Math.min(start + BATCH, COUNT); n++) {
    batch.push({ n, src: srcPath(sourceIndex(n)) });
  }

  const encoded = await page.evaluate(
    async ({ batch, width, quality }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`could not load ${src}`));
          img.src = src;
        });

      const out = [];
      for (const item of batch) {
        const img = await load(item.src);
        const height = Math.round(img.height * (width / img.width));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        out.push({
          n: item.n,
          data: canvas.toDataURL("image/jpeg", quality).split(",")[1],
        });
      }
      return out;
    },
    { batch, width: WIDTH, quality: QUALITY }
  );

  for (const { n, data } of encoded) {
    const bytes = Buffer.from(data, "base64");
    total += bytes.length;
    await writeFile(join(OUT, outName(n)), bytes);
  }
  process.stdout.write(`\r  ${Math.min(start + BATCH, COUNT)}/${COUNT} frames`);
}

console.log(
  `\nwrote ${COUNT} frames to public/frames-sm at ${WIDTH}px — ${(total / 1024 / 1024).toFixed(2)}MB total, ${Math.round(
    total / COUNT / 1024
  )}KB each`
);

// --------------------------------------------------------------- the garments

/**
 * The cut-outs that hang at each stop, at a size a phone can use.
 *
 * The originals are 130–280KB each and 800MB-worth of intent: they are meant to
 * be looked at on a desktop, where they render several hundred pixels wide. On
 * a phone the same image is drawn about 110px across, so almost all of that
 * file is detail thrown away by the scaler — 813KB of it across the four.
 *
 * WebP with alpha, because these are cut-outs and a white box behind a jacket
 * would be worse than not showing it at all.
 */
const PIECE_WIDTH = 360;
const PIECE_QUALITY = 0.82;
const PIECES = ["garment-shirt", "garment-jacket", "garment-pants", "garment-knit"];

const PIECES_OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "garments-sm");
await rm(PIECES_OUT, { recursive: true, force: true });
await mkdir(PIECES_OUT, { recursive: true });

let pieceTotal = 0;
for (const name of PIECES) {
  const data = await page.evaluate(
    async ({ src, width, quality }) => {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error(`could not load ${src}`));
        i.src = src;
      });
      const height = Math.round(img.height * (width / img.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/webp", quality).split(",")[1];
    },
    { src: `/${name}.webp`, width: PIECE_WIDTH, quality: PIECE_QUALITY }
  );
  const bytes = Buffer.from(data, "base64");
  pieceTotal += bytes.length;
  await writeFile(join(PIECES_OUT, `${name}.webp`), bytes);
}

console.log(
  `wrote ${PIECES.length} garments to public/garments-sm at ${PIECE_WIDTH}px — ${Math.round(
    pieceTotal / 1024
  )}KB total`
);

await browser.close();
