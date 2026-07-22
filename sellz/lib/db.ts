import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";

/**
 * Netlify Functions have no persistent disk — a file written during one
 * request can be gone by the next. Locally (plain `next dev`/`next start`)
 * there's no NETLIFY env var, so this falls back to the JSON file on disk
 * exactly as before.
 */
const useBlobs = Boolean(process.env.NETLIFY);

const BLOB_STORE_NAME = "levoz-data";
const BLOB_KEY = "store.json";

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: BLOB_STORE_NAME, consistency: "strong" });
}

export async function readRaw(): Promise<string | null> {
  if (useBlobs) {
    const store = await getBlobStore();
    return (await store.get(BLOB_KEY, { type: "text" })) ?? null;
  }
  ensureDirs();
  try {
    return fs.readFileSync(STORE_PATH, "utf8");
  } catch {
    return null;
  }
}

export async function writeRaw(json: string): Promise<void> {
  if (useBlobs) {
    const store = await getBlobStore();
    await store.set(BLOB_KEY, json);
    return;
  }
  ensureDirs();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, STORE_PATH);
}
