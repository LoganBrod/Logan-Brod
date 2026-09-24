// Publish the vault to Vercel Blob so the dashboard on Vercel can read it, and bring back
// anything the phone wrote (memories, study requests, chat logs, read flags).
//
// The vault lives on this Mac. Vercel cannot see it. So after every sync the brain uploads
// one private JSON file with every note and every system file, and the dashboard on Vercel
// reads that instead of a folder. Writes made on Vercel land in a small "outbox" of blobs
// that this script applies to the real vault, then deletes, before it uploads a new copy.
//
//   npm run publish                       push now
//   npm run publish:dry                   say what would be pushed and applied, touch nothing
//   tsx src/publish.ts --if-configured    what `sync` runs: a silent no-op without a token
//
// Needs BLOB_READ_WRITE_TOKEN in .env (from the Blob store on your Vercel project).
import fs from "node:fs/promises";
import path from "node:path";
import { put, list, get, del } from "@vercel/blob";
import { VAULT_PATH } from "./config.js";
import { appendLog } from "./vault.js";

export const SNAPSHOT = "school-os/vault.json";
export const OUTBOX = "school-os/outbox/";
const SKIP_DIRS = new Set(["_sources", "node_modules", "logs"]);
const KEEP = /\.(md|json)$/i;
const MAX_BYTES = 40 * 1024 * 1024;

type Snapshot = { v: 1; generated: string; files: Record<string, { text: string; mtime: number }> };
type Op = { type: "append" | "write"; rel: string; text: string; at?: string };

const dry = process.argv.includes("--dry-run");
const ifConfigured = process.argv.includes("--if-configured");

async function walk(dir: string, rel: string, out: Snapshot["files"]) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full, r, out); continue; }
    if (!KEEP.test(e.name)) continue;
    const st = await fs.stat(full);
    if (st.size > 2 * 1024 * 1024) continue;
    out[r] = { text: await fs.readFile(full, "utf8"), mtime: st.mtimeMs };
  }
}

/** A vault-relative path the phone is allowed to write: inside the vault, a note or a system json. */
export function safeRel(rel: string): string | null {
  const n = path.posix.normalize(rel.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!n || n.startsWith("..") || n.includes("/../") || path.isAbsolute(n)) return null;
  if (!KEEP.test(n)) return null;
  if (n.split("/").some((p) => p.startsWith("."))) return null;
  return n;
}

export async function applyOp(op: Op, root = VAULT_PATH): Promise<string> {
  const rel = safeRel(op.rel);
  if (!rel || (op.type !== "append" && op.type !== "write") || typeof op.text !== "string") throw new Error(`bad op ${JSON.stringify(op).slice(0, 120)}`);
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  if (op.type === "append") await fs.appendFile(full, op.text);
  else await fs.writeFile(full, op.text);
  return rel;
}

async function applyOutbox(): Promise<number> {
  const { blobs } = await list({ prefix: OUTBOX, limit: 500 });
  blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  let n = 0;
  for (const b of blobs) {
    const res = await get(b.url, { access: "private", useCache: false });
    if (!res) continue;
    let op: Op;
    try { op = JSON.parse(await new Response(res.stream).text()); }
    catch { console.error(`outbox: ${b.pathname} is not JSON, deleting`); if (!dry) await del(b.url); continue; }
    if (dry) { console.log(`would apply ${op.type} → ${op.rel}`); continue; }
    try {
      const rel = await applyOp(op);
      console.log(`applied ${op.type} from the phone → ${rel}`);
      n++;
    } catch (err) {
      console.error(`outbox: ${err instanceof Error ? err.message : err}`);
    }
    await del(b.url);
  }
  return n;
}

export async function buildSnapshot(root = VAULT_PATH): Promise<Snapshot> {
  const files: Snapshot["files"] = {};
  await walk(root, "", files);
  return { v: 1, generated: new Date().toISOString(), files };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (!ifConfigured) console.log("BLOB_READ_WRITE_TOKEN is not set in .env. See README → On your phone.");
    return;
  }
  const applied = await applyOutbox();

  const snap = await buildSnapshot();
  const files = snap.files;
  const body = JSON.stringify(snap);
  const size = Buffer.byteLength(body);
  const count = Object.keys(files).length;
  if (size > MAX_BYTES) throw new Error(`the vault copy is ${(size / 1e6).toFixed(1)} MB, more than the ${MAX_BYTES / 1e6} MB limit`);
  if (dry) { console.log(`would upload ${count} files, ${(size / 1e6).toFixed(2)} MB`); return; }

  await put(SNAPSHOT, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
  await appendLog(`published ${count} files to Vercel (${(size / 1e6).toFixed(2)} MB)${applied ? `, applied ${applied} change${applied === 1 ? "" : "s"} from the phone` : ""}`);
  console.log(`Published ${count} files (${(size / 1e6).toFixed(2)} MB) to Vercel Blob.${applied ? ` Applied ${applied} from the phone.` : ""}`);
}

if (!process.argv.includes("--no-main")) main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
