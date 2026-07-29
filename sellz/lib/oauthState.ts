import crypto from "crypto";

/**
 * Signed state for the eBay OAuth round trip.
 *
 * eBay's RuName pins one callback URL for the whole app, so the callback
 * cannot tell tenants apart by path, and it arrives as a plain browser
 * redirect with no session guaranteed. The tenant therefore has to travel in
 * the `state` parameter — and a bare userId there would let anyone bind their
 * own eBay account to someone else's LevoZ account just by editing a URL.
 *
 * So state is HMAC-signed with the app secret and carries a timestamp: the
 * callback only accepts a signature it produced itself, and only for a few
 * minutes. Consent flows take seconds, so a short window costs nothing.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SECRET (or NEXTAUTH_SECRET) must be set — it signs the eBay OAuth state parameter"
    );
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeState(userId: string, opts?: { labels?: boolean }): string {
  const payload = JSON.stringify({
    u: userId,
    t: Date.now(),
    l: opts?.labels ? 1 : 0,
  });
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sign(body)}`;
}

export interface DecodedState {
  userId: string;
  labels: boolean;
}

/** Returns null for anything not signed by us, malformed, or expired. */
export function decodeState(state: string | null): DecodedState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  // Constant-time compare so a wrong signature cannot be probed byte by byte.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.u !== "string" || typeof parsed.t !== "number") return null;
    if (Date.now() - parsed.t > MAX_AGE_MS) return null;
    return { userId: parsed.u, labels: parsed.l === 1 };
  } catch {
    return null;
  }
}
