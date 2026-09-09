// eBay OAuth2 client-credentials grant, shared by search and the taxonomy
// lookup. Split out so those two can't form an import cycle.

const EBAY_ENV = process.env.EBAY_ENV === "sandbox" ? "sandbox" : "production";

const OAUTH_URL =
  EBAY_ENV === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

export const BROWSE_BASE =
  EBAY_ENV === "sandbox"
    ? "https://api.sandbox.ebay.com/buy/browse/v1"
    : "https://api.ebay.com/buy/browse/v1";

const BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/*
 * One request in flight per scope.
 *
 * The cache is only consulted once a token exists. On a cold process the
 * fifteen searches that build the calibration deck all miss it in the same
 * millisecond and each asked eBay for its own token - fifteen OAuth round
 * trips to get one string, and a good way to be throttled by the endpoint
 * that gates every other call. Holding the promise means the second caller
 * waits on the first caller's request instead of making another.
 */
const pending = new Map<string, Promise<string>>();

export async function getAppToken(scope: string = BASE_SCOPE): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const already = pending.get(scope);
  if (already) return already;

  const request = mintToken(scope).finally(() => pending.delete(scope));
  pending.set(scope, request);
  return request;
}

async function mintToken(scope: string): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
    cache: "no-store",
    // Every search waits behind this one call, so it gets the tightest
    // deadline of the three.
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay OAuth failed: HTTP ${res.status} ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(scope, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}
