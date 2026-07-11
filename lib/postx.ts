import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "./paths";
import { getClip, updateClip } from "./store";

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const TWEET_URL = "https://api.twitter.com/2/tweets";
const CHUNK = 4 * 1024 * 1024;

interface XCreds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export function xConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET
  );
}

function creds(): XCreds {
  if (!xConfigured()) {
    throw new Error(
      "X posting needs X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET in .env.local"
    );
  }
  return {
    apiKey: process.env.X_API_KEY!,
    apiSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_SECRET!,
  };
}

function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * OAuth 1.0a HMAC-SHA1 Authorization header. `params` must contain every
 * request parameter that participates in the signature: query params and
 * url-encoded body params — but NOT multipart bodies or JSON bodies.
 */
function oauthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  c: XCreds
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all)
    .map((k) => [pct(k), pct(all[k])] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join("&");
  const key = `${pct(c.apiSecret)}&${pct(c.accessSecret)}`;
  const signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map((k) => `${pct(k)}="${pct(header[k])}"`)
      .join(", ")
  );
}

async function uploadCommand(
  c: XCreds,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: oauthHeader("POST", UPLOAD_URL, params, c),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    throw new Error(`X media ${params.command} failed (${res.status}): ${await res.text()}`);
  }
  return res.status === 204 ? {} : ((await res.json()) as Record<string, unknown>);
}

async function uploadVideo(filePath: string, c: XCreds): Promise<string> {
  const data = await fs.readFile(filePath);

  const init = await uploadCommand(c, {
    command: "INIT",
    total_bytes: String(data.byteLength),
    media_type: "video/mp4",
    media_category: "tweet_video",
  });
  const mediaId = String(init.media_id_string);

  for (let i = 0; i * CHUNK < data.byteLength; i++) {
    const chunk = data.subarray(i * CHUNK, (i + 1) * CHUNK);
    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(i));
    form.append("media", new Blob([new Uint8Array(chunk)]), "chunk.mp4");
    // Multipart bodies are excluded from the OAuth signature
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: oauthHeader("POST", UPLOAD_URL, {}, c) },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`X media APPEND failed (${res.status}): ${await res.text()}`);
    }
  }

  let status = await uploadCommand(c, { command: "FINALIZE", media_id: mediaId });
  // Video is processed async — poll until X says it's ready
  for (let i = 0; i < 30; i++) {
    const info = status.processing_info as
      | { state: string; check_after_secs?: number; error?: { message?: string } }
      | undefined;
    if (!info || info.state === "succeeded") return mediaId;
    if (info.state === "failed") {
      throw new Error(`X rejected the video: ${info.error?.message ?? "unknown reason"}`);
    }
    await new Promise((r) => setTimeout(r, (info.check_after_secs ?? 3) * 1000));
    const query = { command: "STATUS", media_id: mediaId };
    const url = `${UPLOAD_URL}?${new URLSearchParams(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: oauthHeader("GET", UPLOAD_URL, query, c) },
    });
    if (!res.ok) throw new Error(`X media STATUS failed (${res.status})`);
    status = (await res.json()) as Record<string, unknown>;
  }
  throw new Error("Timed out waiting for X to process the video");
}

/** Upload a clip's video and post it. Returns the tweet id + URL. */
export async function postToX(
  filePath: string,
  text: string
): Promise<{ id: string; url: string }> {
  const c = creds();
  const mediaId = await uploadVideo(filePath, c);
  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      // JSON bodies are excluded from the OAuth signature
      Authorization: oauthHeader("POST", TWEET_URL, {}, c),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: text.slice(0, 280), media: { media_ids: [mediaId] } }),
  });
  if (!res.ok) {
    throw new Error(`X post failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { id?: string } };
  const id = data.data?.id;
  if (!id) throw new Error("X post returned no tweet id");
  return { id, url: `https://x.com/i/status/${id}` };
}

/** Post a finished clip and persist the result on its record. */
export async function postClipToX(clipId: string): Promise<void> {
  const clip = getClip(clipId);
  if (!clip?.file) throw new Error("Clip has no video file yet");
  if (clip.posted) throw new Error("Clip is already posted");
  const text = clip.caption?.trim() || clip.hooks?.[0] || "New clip 🎬";
  const result = await postToX(path.join(DATA_DIR, clip.file), text);
  updateClip(clipId, {
    posted: { platform: "x", id: result.id, url: result.url, at: new Date().toISOString() },
  });
}

/** Refresh a posted clip's public metrics from the X API. */
export async function refreshMetrics(clipId: string): Promise<void> {
  const clip = getClip(clipId);
  if (!clip?.posted) throw new Error("Clip isn't posted yet");
  const c = creds();
  const url = `https://api.twitter.com/2/tweets/${clip.posted.id}`;
  const query = { "tweet.fields": "public_metrics" };
  const res = await fetch(`${url}?${new URLSearchParams(query)}`, {
    headers: { Authorization: oauthHeader("GET", url, query, c) },
  });
  if (!res.ok) {
    throw new Error(
      `X metrics fetch failed (${res.status}) — free API tier has very limited reads; you can type the numbers in manually instead`
    );
  }
  const data = (await res.json()) as {
    data?: {
      public_metrics?: {
        impression_count?: number;
        like_count?: number;
        retweet_count?: number;
      };
    };
  };
  const pm = data.data?.public_metrics;
  if (!pm) throw new Error("No metrics in X response");
  updateClip(clipId, {
    metrics: {
      views: pm.impression_count ?? 0,
      likes: pm.like_count ?? 0,
      reposts: pm.retweet_count ?? 0,
      updatedAt: new Date().toISOString(),
    },
  });
}
