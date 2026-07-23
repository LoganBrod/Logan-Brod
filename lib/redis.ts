// Minimal Upstash Redis REST client — no npm dependency needed.
// Reads the env var names Vercel injects when you add Upstash via the Marketplace
// (UPSTASH_REDIS_REST_*) or the older Vercel KV integration (KV_REST_API_*).

const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export function redisConfigured(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

async function command<T>(...args: Array<string | number>): Promise<T> {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error(
      "Redis is not configured. Add Upstash Redis to the Vercel project (Storage → Marketplace) so UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set."
    );
  }

  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !json || json.error) {
    throw new Error(`Redis command failed: ${json?.error ?? `HTTP ${res.status}`}`);
  }
  return json.result as T;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await command<string | null>("GET", key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await command("SET", key, JSON.stringify(value));
}

export async function deleteKey(key: string): Promise<void> {
  await command("DEL", key);
}
