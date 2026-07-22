import { getEbayTokens, setEbayTokens, type EbayTokens } from "./store";

type EbayEnv = "sandbox" | "production";

function env(): EbayEnv {
  return process.env.EBAY_ENV === "sandbox" ? "sandbox" : "production";
}

function requireCreds() {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !process.env.EBAY_RUNAME) {
    throw new Error(
      "eBay isn't configured — set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME in .env.local"
    );
  }
}

const AUTH_BASE: Record<EbayEnv, string> = {
  production: "https://auth.ebay.com",
  sandbox: "https://auth.sandbox.ebay.com",
};

const API_BASE: Record<EbayEnv, string> = {
  production: "https://api.ebay.com",
  sandbox: "https://api.sandbox.ebay.com",
};

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
].join(" ");

export function getAuthorizeUrl(): string {
  requireCreds();
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID!,
    redirect_uri: process.env.EBAY_RUNAME!,
    response_type: "code",
    scope: SCOPES,
  });
  return `${AUTH_BASE[env()]}/oauth2/authorize?${params.toString()}`;
}

function basicAuthHeader(): string {
  const raw = `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  requireCreds();
  const e = env();
  const res = await fetch(`${API_BASE[e]}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.EBAY_RUNAME!,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`eBay token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data: TokenResponse = await res.json();
  if (!data.refresh_token) {
    throw new Error("eBay didn't return a refresh token — check the app's requested scopes");
  }
  await setEbayTokens({
    env: e,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    connectedAt: new Date().toISOString(),
  });
}

async function refreshAccessToken(tokens: EbayTokens): Promise<EbayTokens> {
  requireCreds();
  const res = await fetch(`${API_BASE[tokens.env]}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      scope: SCOPES,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`eBay token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data: TokenResponse = await res.json();
  const updated: EbayTokens = {
    ...tokens,
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  await setEbayTokens(updated);
  return updated;
}

/** A valid access token, refreshing first if it's expired or about to be. */
async function getValidTokens(): Promise<EbayTokens> {
  const tokens = await getEbayTokens();
  if (!tokens) throw new Error("eBay account isn't connected yet");
  const expiresInMs = new Date(tokens.accessTokenExpiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) return tokens;
  return refreshAccessToken(tokens);
}

export async function isEbayConnected(): Promise<boolean> {
  return Boolean(await getEbayTokens());
}

export interface EbayListingStats {
  views?: number;
  soldPrice?: number;
  soldAt?: string;
}

interface TrafficReportRecord {
  listingId?: string;
  dimensionMetrics?: { metricKey?: string; metricValue?: string }[];
}

/** Views/impressions for one listing via the Sell Analytics Traffic Report. */
async function fetchViews(itemId: string, tokens: EbayTokens): Promise<number | undefined> {
  const params = new URLSearchParams({
    dimension: "LISTING",
    filter: `marketplace_ids:{EBAY_US},listing_ids:{${itemId}}`,
    metric: "LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL",
  });
  const res = await fetch(
    `${API_BASE[tokens.env]}/sell/analytics/v1/traffic_report?${params.toString()}`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
  );
  if (!res.ok) return undefined;
  const data: { records?: TrafficReportRecord[] } = await res.json();
  const record = data.records?.find((r) => r.listingId === itemId);
  const viewsMetric = record?.dimensionMetrics?.find((m) => m.metricKey === "LISTING_VIEWS_TOTAL");
  return viewsMetric?.metricValue ? Number(viewsMetric.metricValue) : undefined;
}

interface OrderLineItem {
  legacyItemId?: string;
}
interface Order {
  creationDate?: string;
  pricingSummary?: { total?: { value?: string } };
  lineItems?: OrderLineItem[];
}

/**
 * Sold price + date for one listing via the Sell Fulfillment orders API.
 * Only checks the most recent 50 orders (no pagination yet) — fine for
 * catching a recent sale, may miss older ones on a high-volume account.
 */
async function fetchSale(
  itemId: string,
  tokens: EbayTokens
): Promise<{ soldPrice?: number; soldAt?: string }> {
  const params = new URLSearchParams({ limit: "50" });
  const res = await fetch(`${API_BASE[tokens.env]}/sell/fulfillment/v1/order?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!res.ok) return {};
  const data: { orders?: Order[] } = await res.json();
  for (const order of data.orders ?? []) {
    const match = order.lineItems?.find((li) => li.legacyItemId === itemId);
    if (match) {
      return {
        soldPrice: order.pricingSummary?.total?.value
          ? Number(order.pricingSummary.total.value)
          : undefined,
        soldAt: order.creationDate,
      };
    }
  }
  return {};
}

export async function fetchListingStats(itemId: string): Promise<EbayListingStats> {
  const tokens = await getValidTokens();
  const [views, sale] = await Promise.all([fetchViews(itemId, tokens), fetchSale(itemId, tokens)]);
  return { views, ...sale };
}
