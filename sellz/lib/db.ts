import fs from "fs";
import { getStore } from "@netlify/blobs";
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

function getBlobStore() {
  // Netlify normally auto-configures getStore() from the request environment.
  // If that ever isn't wired up correctly, an explicit siteID + token (a
  // Netlify Personal Access Token, set as NETLIFY_BLOBS_TOKEN) bypasses
  // auto-detection entirely as a fallback.
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: BLOB_STORE_NAME, consistency: "strong", siteID, token });
  }
  return getStore({ name: BLOB_STORE_NAME, consistency: "strong" });
}

export async function readRaw(): Promise<string | null> {
  if (useBlobs) {
    const store = getBlobStore();
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
    const store = getBlobStore();
    await store.set(BLOB_KEY, json);
    return;
  }
  ensureDirs();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, STORE_PATH);
}
