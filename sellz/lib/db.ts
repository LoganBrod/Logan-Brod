import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";
import { openStore, useBlobs } from "./blobStore";

/**
 * Netlify Functions have no persistent disk — a file written during one
 * request can be gone by the next — so deployed runs go through Netlify
 * Blobs while local runs keep using the JSON file on disk.
 */
const BLOB_STORE_NAME = "levoz-data";
const BLOB_KEY = "store.json";

function getBlobStore() {
  return openStore(BLOB_STORE_NAME);
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
