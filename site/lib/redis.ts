// Minimal Upstash Redis REST client — no npm dependency needed.
// Reads the env var names Vercel injects for Upstash (UPSTASH_REDIS_REST_*) or
// the older Vercel KV integration (KV_REST_API_*).
//
// Ported from the parent repo, extended with TTL support and SETNX, both of
// which the closet needs and the original didn't have.

const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export function redisConfigured(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

async function command<T>(...args: Array<string | number>): Promise<T> {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error(
      "Saving is not configured. Add Upstash Redis (Vercel → Storage → Marketplace) so UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set."
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

  const json = (await res.json().catch(() => null)) as
    | { result?: T; error?: string }
    | null;
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

export async function setJson(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  if (ttlSeconds) {
    await command("SET", key, JSON.stringify(value), "EX", ttlSeconds);
  } else {
    await command("SET", key, JSON.stringify(value));
  }
}

/**
 * Claim a key only if it is free. Returns false when another writer already has
 * it — this is what makes closet-code collisions safe rather than destructive.
 */
export async function claimKey(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<boolean> {
  const result = await command<string | null>(
    "SET",
    key,
    JSON.stringify(value),
    "EX",
    ttlSeconds,
    "NX"
  );
  return result === "OK";
}

export async function expire(key: string, ttlSeconds: number): Promise<void> {
  await command("EXPIRE", key, ttlSeconds);
}

/** Drop a key's expiry, so it lives until it's deleted. What "keeping" a closet means. */
export async function persist(key: string): Promise<void> {
  await command("PERSIST", key);
}

/**
 * Read a key and delete it in the same round trip.
 *
 * This is what makes a sign-in link single-use: two clicks on the same link
 * race for one value, and only one of them can win. Doing it as a read then a
 * delete would leave a window where both succeed.
 */
export async function takeJson<T>(key: string): Promise<T | null> {
  const raw = await command<string | null>("GETDEL", key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Increment a counter that expires, and return the new value.
 *
 * The expiry is set every time rather than only on creation. That makes this a
 * sliding window instead of a fixed one, which is the stricter reading and the
 * right one for "stop sending this address emails".
 */
export async function bump(key: string, ttlSeconds: number): Promise<number> {
  const count = await command<number>("INCR", key);
  await command("EXPIRE", key, ttlSeconds);
  return count;
}

export async function deleteKey(key: string): Promise<void> {
  await command("DEL", key);
}
