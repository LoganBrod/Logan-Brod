// Builds the smaller copies of everything the marketing page loads.
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
// There are three passes — frames, garments, textures — and by default all
// three run. A second argument narrows it:
//
//   node scripts/build-phone-frames.mjs http://127.0.0.1:3000 textures
//
// which matters because the output is committed: re-encoding 66 corridor
// frames that nobody changed produces 66 byte-different files and a diff that
// hides the one thing you actually did.
//
// Playwright is deliberately not in package.json: this runs by hand, roughly
// never, and its output — public/frames-sm, public/garments-sm and
// public/textures-sm — is committed. Re-run a pass only when its source
// images change.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Borrowed rather than depended on, the same way `contrast-audit.mjs` does it:
// ESM `import()` ignores NODE_PATH, so pointing at an install that lives
// somewhere else needs an actual path.
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.error(
    "This script re-encodes images in a real browser, and Playwright isn't installed here.\n\n" +
      "  npx playwright@1 install chromium\n\n" +
      "or point at an existing install:\n\n" +
      "  PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.js \\\n" +
      "    node scripts/build-phone-frames.mjs http://127.0.0.1:3000\n"
  );
  process.exit(2);
}

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3000";

const PASSES = ["frames", "garments", "textures"];
const only = process.argv[3];
if (only && !PASSES.includes(only)) {
  console.error(`unknown pass "${only}" — expected one of ${PASSES.join(", ")}`);
  process.exit(2);
}
const runs = (pass) => !only || only === pass;

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

let total = 0;
const BATCH = 10;

if (runs("frames")) {
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

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
}

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

if (runs("garments")) {
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
}

// --------------------------------------------------------------- the cloth

/**
 * The two macro stills on the marketing page, at a width a phone can afford.
 *
 * The originals are 2560px and 250–310KB. On a phone the square crop is drawn
 * about 350 CSS px across and the band about 390 — so the large file exists
 * only to be thrown away by the scaler. These are offered alongside the
 * originals in a `srcset`, so a wide screen still gets the full-resolution
 * cloth and a phone never downloads it.
 *
 * 1400 rather than 760: unlike a corridor frame these are cropped, and the
 * square takes barely half the source's width. Cropping is what decides this
 * number, not the size it renders at.
 */
const CLOTH_WIDTH = 1400;
const CLOTH_QUALITY = 0.82;
const CLOTH = ["texture-1", "texture-2"];

const CLOTH_OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures-sm");

if (runs("textures")) {
await rm(CLOTH_OUT, { recursive: true, force: true });
await mkdir(CLOTH_OUT, { recursive: true });

let clothTotal = 0;
for (const name of CLOTH) {
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
    { src: `/${name}.webp`, width: CLOTH_WIDTH, quality: CLOTH_QUALITY }
  );
  const bytes = Buffer.from(data, "base64");
  clothTotal += bytes.length;
  await writeFile(join(CLOTH_OUT, `${name}.webp`), bytes);
}

console.log(
  `wrote ${CLOTH.length} textures to public/textures-sm at ${CLOTH_WIDTH}px — ${Math.round(
    clothTotal / 1024
  )}KB total`
);
}

await browser.close();
