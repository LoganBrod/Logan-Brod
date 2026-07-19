import path from "path";
import fs from "fs";

export const DATA_DIR = path.join(process.cwd(), "data");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
export const WORK_DIR = path.join(DATA_DIR, "work");
export const STORE_PATH = path.join(DATA_DIR, "store.json");

export function ensureDirs() {
  for (const dir of [DATA_DIR, ASSETS_DIR, WORK_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
