import path from "path";
import fs from "fs";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const CLIPS_DIR = path.join(DATA_DIR, "clips");
export const WORK_DIR = path.join(DATA_DIR, "work");
export const STORE_PATH = path.join(DATA_DIR, "store.json");

export function ensureDirs() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, CLIPS_DIR, WORK_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
