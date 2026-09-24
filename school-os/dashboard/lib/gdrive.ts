// Live, read-only access to the student's Google Docs through the same service account the brain
// uses. No googleapis package: a signed JWT, one token call, two Drive REST calls. Works on the Mac
// (GOOGLE_SERVICE_ACCOUNT_KEY is a path to service-account.json) and on Vercel (the same variable
// holds the file's contents, starting with "{").
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createSign } from "node:crypto";

type Key = { client_email: string; private_key: string; token_uri?: string };
export type Doc = { id: string; name: string; modified: string; url: string };

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOC = "application/vnd.google-apps.document";
let keyCache: Key | null | undefined;
let token: { value: string; exp: number } | null = null;

export function driveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").trim();
}

async function key(): Promise<Key> {
  if (keyCache) return keyCache;
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").trim();
  if (!raw) throw new Error("Google Docs are not connected: GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  let text = raw;
  if (!raw.startsWith("{")) {
    const p = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), "..", raw);
    text = await fs.readFile(p, "utf8").catch(() => fs.readFile(path.resolve(process.cwd(), raw), "utf8"));
  }
  const k = JSON.parse(text) as Key;
  if (!k.client_email || !k.private_key) throw new Error("the service account key is missing client_email or private_key");
  keyCache = k;
  return k;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string> {
  if (token && token.exp - 60_000 > Date.now()) return token.value;
  const k = await key();
  const now = Math.floor(Date.now() / 1000);
  const aud = k.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iss: k.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(k.private_key);
  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64(sig)}` }),
  });
  if (!res.ok) throw new Error(`Google would not sign in the service account (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function drive<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`Google Drive said ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (res.headers.get("content-type") ?? "").includes("json") ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Docs the service account can see, newest first, optionally matching words in the title or text. */
export async function searchDocs(query = "", limit = 10): Promise<Doc[]> {
  const parts = [`mimeType = '${DOC}'`, "trashed = false"];
  const term = query.trim();
  if (term) parts.push(`(name contains '${q(term)}' or fullText contains '${q(term)}')`);
  const folder = (process.env.GDOCS_FOLDER_ID ?? "").trim();
  const params = new URLSearchParams({
    q: parts.join(" and "), orderBy: "modifiedTime desc", pageSize: String(limit),
    fields: "files(id,name,modifiedTime,webViewLink)", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  const data = await drive<{ files?: { id: string; name: string; modifiedTime: string; webViewLink?: string }[] }>(`https://www.googleapis.com/drive/v3/files?${params}`);
  const docs = (data.files ?? []).map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime.slice(0, 10), url: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` }));
  void folder; // everything shared with the service account counts, not just the sync folder
  return docs;
}

/** One doc as markdown, capped. */
export async function readDoc(id: string, maxChars = 60_000): Promise<Doc & { body: string }> {
  const clean = id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!clean) throw new Error("no document id");
  const [meta, body] = await Promise.all([
    drive<{ id: string; name: string; modifiedTime: string; webViewLink?: string }>(`https://www.googleapis.com/drive/v3/files/${clean}?fields=id,name,modifiedTime,webViewLink&supportsAllDrives=true`),
    drive<string>(`https://www.googleapis.com/drive/v3/files/${clean}/export?mimeType=text/markdown`),
  ]);
  return { id: meta.id, name: meta.name, modified: meta.modifiedTime.slice(0, 10), url: meta.webViewLink ?? `https://docs.google.com/document/d/${clean}/edit`, body: String(body).slice(0, maxChars) };
}

/** Pull a doc id out of a pasted link. */
export function docIdFromUrl(s: string): string | null {
  return s.match(/\/document\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(s.trim()) ? s.trim() : null);
}
