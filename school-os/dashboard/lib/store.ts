// Where the dashboard's files come from. Two modes, same small API, vault-relative paths:
//
//   local   the vault folder on this computer (VAULT_PATH). What `npm run dashboard` uses.
//   cloud   the private copy the brain uploads to Vercel Blob (`npm run publish`). What the app
//           on Vercel uses: there is no VAULT_PATH there, only BLOB_READ_WRITE_TOKEN.
//
// In cloud mode reads come from a JSON snapshot cached in memory and re-checked every 30 seconds.
// Writes go two places: into that in-memory copy, so the page reflects them at once, and into an
// "outbox" of small blobs the brain applies to the real vault on its next sync, then deletes.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), "..", ".env") });
loadEnv({ path: path.join(process.cwd(), ".env") });

export const VAULT = path.resolve(process.env.VAULT_PATH ?? "");
export const MODE: "local" | "cloud" =
  process.env.VAULT_MODE === "cloud" || (!process.env.VAULT_PATH && (!!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VAULT_SNAPSHOT_FILE)) ? "cloud" : "local";

export type Entry = { name: string; dir: boolean };
export interface Store {
  exists(rel: string): Promise<boolean>;
  /** Children of a folder. Empty when the folder does not exist. */
  readdir(rel: string): Promise<Entry[]>;
  readFile(rel: string): Promise<string>;
  mtime(rel: string): Promise<number>;
  writeFile(rel: string, text: string): Promise<void>;
  appendFile(rel: string, text: string): Promise<void>;
}

/** Join vault-relative pieces with forward slashes, whatever the platform. */
export const join = (...parts: string[]) => path.posix.normalize(parts.filter(Boolean).map((p) => p.split(path.sep).join("/")).join("/")).replace(/^\.\/?/, "");

// ---- local: the real folder ----
const local: Store = {
  async exists(rel) { try { await fs.access(abs(rel)); return true; } catch { return false; } },
  async readdir(rel) {
    try { return (await fs.readdir(abs(rel), { withFileTypes: true })).map((e) => ({ name: e.name, dir: e.isDirectory() })); }
    catch { return []; }
  },
  readFile: (rel) => fs.readFile(abs(rel), "utf8"),
  mtime: async (rel) => (await fs.stat(abs(rel))).mtimeMs,
  async writeFile(rel, text) { await fs.mkdir(path.dirname(abs(rel)), { recursive: true }); await fs.writeFile(abs(rel), text); },
  async appendFile(rel, text) { await fs.mkdir(path.dirname(abs(rel)), { recursive: true }); await fs.appendFile(abs(rel), text); },
};
function abs(rel: string) {
  const full = path.resolve(VAULT, rel);
  if (full !== VAULT && !full.startsWith(VAULT + path.sep)) throw new Error("path escapes the vault");
  return full;
}

// ---- cloud: the snapshot on Vercel Blob ----
const SNAPSHOT = "school-os/vault.json", OUTBOX = "school-os/outbox/";
type Snapshot = { v: 1; generated: string; files: Record<string, { text: string; mtime: number }> };
let cache: { snap: Snapshot; etag: string; checkedAt: number } | null = null;
let loading: Promise<Snapshot> | null = null;

async function snapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.checkedAt < 30_000) return cache.snap;
  if (loading) return loading;
  loading = (async () => {
    try {
      if (process.env.VAULT_SNAPSHOT_FILE) {
        // A local file standing in for the blob. For testing the cloud mode on a laptop.
        const text = await fs.readFile(process.env.VAULT_SNAPSHOT_FILE, "utf8");
        cache = { snap: JSON.parse(text), etag: String(text.length), checkedAt: Date.now() };
        return cache.snap;
      }
      const { list, get } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: SNAPSHOT, limit: 1 });
      const meta = blobs.find((b) => b.pathname === SNAPSHOT);
      if (!meta) { cache = { snap: { v: 1, generated: "", files: {} }, etag: "", checkedAt: Date.now() }; return cache.snap; }
      if (cache && cache.etag === meta.etag) { cache.checkedAt = Date.now(); return cache.snap; }
      const res = await get(meta.url, { access: "private", useCache: false });
      if (!res) throw new Error("snapshot vanished between list and get");
      const snap = JSON.parse(await new Response(res.stream).text()) as Snapshot;
      cache = { snap, etag: meta.etag, checkedAt: Date.now() };
      return snap;
    } catch (err) {
      if (cache) { cache.checkedAt = Date.now(); return cache.snap; } // stale beats broken
      throw err;
    } finally { loading = null; }
  })();
  return loading;
}

async function outbox(op: { type: "append" | "write"; rel: string; text: string }) {
  const body = JSON.stringify({ ...op, at: new Date().toISOString() });
  if (process.env.VAULT_SNAPSHOT_FILE) { await fs.appendFile(process.env.VAULT_SNAPSHOT_FILE + ".outbox.jsonl", body + "\n"); return; }
  const { put } = await import("@vercel/blob");
  await put(`${OUTBOX}${Date.now()}-${op.type}.json`, body, { access: "private", addRandomSuffix: true, contentType: "application/json" });
}

const norm = (rel: string) => join(rel).replace(/\/$/, "");
const cloud: Store = {
  async exists(rel) {
    const r = norm(rel), files = (await snapshot()).files;
    return r === "" || r in files || Object.keys(files).some((k) => k.startsWith(r + "/"));
  },
  async readdir(rel) {
    const r = norm(rel), prefix = r ? r + "/" : "", seen = new Map<string, boolean>();
    for (const k of Object.keys((await snapshot()).files)) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length), i = rest.indexOf("/");
      const name = i < 0 ? rest : rest.slice(0, i);
      if (name) seen.set(name, (seen.get(name) ?? false) || i >= 0);
    }
    return [...seen].map(([name, dir]) => ({ name, dir })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async readFile(rel) {
    const f = (await snapshot()).files[norm(rel)];
    if (!f) throw Object.assign(new Error(`no such file ${rel}`), { code: "ENOENT" });
    return f.text;
  },
  async mtime(rel) { return (await snapshot()).files[norm(rel)]?.mtime ?? 0; },
  async writeFile(rel, text) {
    const r = norm(rel), snap = await snapshot();
    snap.files[r] = { text, mtime: Date.now() };
    await outbox({ type: "write", rel: r, text });
  },
  async appendFile(rel, text) {
    const r = norm(rel), snap = await snapshot();
    snap.files[r] = { text: (snap.files[r]?.text ?? "") + text, mtime: Date.now() };
    await outbox({ type: "append", rel: r, text });
  },
};

export const store: Store = MODE === "cloud" ? cloud : local;

/** When the copy on Vercel was made. Empty in local mode or before the first publish. */
export async function publishedAt(): Promise<string> {
  return MODE === "cloud" ? (await snapshot()).generated : "";
}
