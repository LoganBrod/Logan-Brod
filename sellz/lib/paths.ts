import path from "path";
import fs from "fs";

export const DATA_DIR = path.join(process.cwd(), "data");
export const STORE_PATH = path.join(DATA_DIR, "store.json");

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
