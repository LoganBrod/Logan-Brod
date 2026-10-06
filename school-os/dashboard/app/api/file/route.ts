// Serves one PDF or image from the vault to the notebook. Local mode only; the path must stay
// inside the vault and be one of those types.
import fs from "node:fs/promises";
import path from "node:path";
import { MODE, VAULT } from "@/lib/store";

const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  if (MODE === "cloud") return new Response("not available on the cloud copy", { status: 404 });
  const full = path.resolve(VAULT, rel);
  const type = TYPES[path.extname(full).toLowerCase()];
  if (!type || !full.startsWith(VAULT + path.sep)) return new Response("no", { status: 404 });
  try {
    const bytes = await fs.readFile(full);
    return new Response(bytes, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch { return new Response("not found", { status: 404 }); }
}
