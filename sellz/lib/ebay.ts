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
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  // Needed to create and publish listings from here
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  // Business policies + merchant location, required to publish an offer
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  // Deliberately NOT requesting buy.marketplace.insights here. That API is a
  // Limited Release that eBay approves case by case and is closed to new
  // users, it needs a client-credentials app token rather than this user
  // token, and asking for a scope the keyset was never granted risks the
  // whole consent failing. See soldCompsAvailable() below.
].join(" ");

const MARKETPLACE_ID = "EBAY_US";

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

// ---------------------------------------------------------------------------
// Comps: what comparable items are going for, weighted to top-rated sellers
// ---------------------------------------------------------------------------

export interface EbayComp {
  title: string;
  price: number;
  condition?: string;
  sellerFeedbackPct?: number;
  sellerFeedbackScore?: number;
  url?: string;
  sold: boolean;
}

interface BrowseItemSummary {
  title?: string;
  price?: { value?: string };
  condition?: string;
  itemWebUrl?: string;
  seller?: { feedbackPercentage?: string; feedbackScore?: number };
}

/**
 * Active comparable listings via the Browse API, filtered to well-rated
 * sellers. These are ASKING prices, not sold prices — labelled accordingly.
 */
async function browseActiveComps(query: string, tokens: EbayTokens): Promise<EbayComp[]> {
  const params = new URLSearchParams({
    q: query.slice(0, 100),
    limit: "40",
    filter: "buyingOptions:{FIXED_PRICE}",
  });
  const res = await fetch(
    `${API_BASE[tokens.env]}/buy/browse/v1/item_summary/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      },
    }
  );
  if (!res.ok) return [];
  const data: { itemSummaries?: BrowseItemSummary[] } = await res.json();
  return (data.itemSummaries ?? [])
    .map((it) => ({
      title: it.title ?? "",
      price: Number(it.price?.value ?? NaN),
      condition: it.condition,
      sellerFeedbackPct: it.seller?.feedbackPercentage
        ? Number(it.seller.feedbackPercentage)
        : undefined,
      sellerFeedbackScore: it.seller?.feedbackScore,
      url: it.itemWebUrl,
      sold: false,
    }))
    .filter((c) => isFinite(c.price) && c.price > 0);
}

/**
 * Visually similar active listings, found from the item photo itself rather
 * than from a guessed search phrase. Much stronger than text comps when we
 * are not confident what the item is called, because eBay matches on the
 * picture and hands back what real sellers titled the same thing.
 */
export async function compsByImage(base64Image: string): Promise<EbayComp[]> {
  const tokens = await getValidTokens();
  const res = await fetch(`${API_BASE[tokens.env]}/buy/browse/v1/item_summary/search_by_image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
    },
    body: JSON.stringify({ image: base64Image }),
  });
  if (!res.ok) return [];
  const data: { itemSummaries?: BrowseItemSummary[] } = await res.json();
  return (data.itemSummaries ?? [])
    .map((it) => ({
      title: it.title ?? "",
      price: Number(it.price?.value ?? NaN),
      condition: it.condition,
      sellerFeedbackPct: it.seller?.feedbackPercentage
        ? Number(it.seller.feedbackPercentage)
        : undefined,
      sellerFeedbackScore: it.seller?.feedbackScore,
      url: it.itemWebUrl,
      sold: false,
    }))
    .filter((c) => isFinite(c.price) && c.price > 0);
}

interface InsightsSale {
  title?: string;
  lastSoldPrice?: { value?: string };
  condition?: string;
  itemWebUrl?: string;
}

/**
 * True only when this deployment has been granted eBay's Limited Release
 * Marketplace Insights API. It is approved case by case and closed to new
 * users, so it is off unless explicitly switched on. Without it there is no
 * official source of sold prices, and comps fall back to asking prices.
 */
export function soldCompsAvailable(): boolean {
  return process.env.EBAY_MARKETPLACE_INSIGHTS === "true";
}

/**
 * Actual sold prices via Marketplace Insights.
 *
 * Note this needs a client-credentials application token scoped to
 * buy.marketplace.insights, which is a different token from the user token
 * used everywhere else here. It stays unreachable until the account is
 * approved and EBAY_MARKETPLACE_INSIGHTS is set.
 */
async function insightsSoldComps(query: string, tokens: EbayTokens): Promise<EbayComp[]> {
  if (!soldCompsAvailable()) return [];
  const params = new URLSearchParams({ q: query.slice(0, 100), limit: "40" });
  const res = await fetch(
    `${API_BASE[tokens.env]}/buy/marketplace_insights/v1_beta/item_sales/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      },
    }
  );
  if (!res.ok) return [];
  const data: { itemSales?: InsightsSale[] } = await res.json();
  return (data.itemSales ?? [])
    .map((s) => ({
      title: s.title ?? "",
      price: Number(s.lastSoldPrice?.value ?? NaN),
      condition: s.condition,
      url: s.itemWebUrl,
      sold: true,
    }))
    .filter((c) => isFinite(c.price) && c.price > 0);
}

export interface CompsResult {
  comps: EbayComp[];
  soldDataAvailable: boolean;
  /** How many listings eBay matched from the photo itself */
  visualMatchCount: number;
  /** Median of the strongest comps — sold if we have them, else asking */
  suggestedPrice?: number;
  priceLow?: number;
  priceHigh?: number;
  note: string;
}

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

/**
 * Comparable-item research for a query, preferring real sold prices and
 * otherwise falling back to asking prices from highly-rated sellers.
 */
export async function researchEbayComps(
  query: string,
  base64Image?: string
): Promise<CompsResult> {
  const tokens = await getValidTokens();
  const [sold, active, visual] = await Promise.all([
    insightsSoldComps(query, tokens).catch(() => []),
    browseActiveComps(query, tokens).catch(() => []),
    // Visual matches are the strongest signal we have when the item is hard
    // to name, so they are gathered alongside the keyword search.
    base64Image ? compsByImage(base64Image).catch(() => []) : Promise.resolve([]),
  ]);

  const soldDataAvailable = sold.length > 0;

  // De-duplicate: the visual and keyword searches often return the same item.
  const seen = new Set<string>();
  const dedupe = (list: EbayComp[]) =>
    list.filter((c) => {
      const key = c.url ?? `${c.title}|${c.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Prefer sellers with strong feedback — their pricing and presentation are
  // what actually converts, which is the whole point of comping against them.
  const wellRated = (list: EbayComp[]) =>
    list
      .filter((c) => (c.sellerFeedbackPct ?? 0) >= 98 && (c.sellerFeedbackScore ?? 0) >= 50)
      .sort((a, b) => (b.sellerFeedbackScore ?? 0) - (a.sellerFeedbackScore ?? 0));

  const visualRated = wellRated(visual);
  const activeRated = wellRated(active);

  // Priority: confirmed sales, then visual matches (they are the same object,
  // not just the same words), then keyword matches.
  const basis = soldDataAvailable
    ? sold
    : visualRated.length >= 3
      ? visualRated
      : visual.length >= 3
        ? visual
        : activeRated.length >= 3
          ? activeRated
          : active;
  const prices = basis.map((c) => c.price);

  const ordered = [
    ...dedupe(sold),
    ...dedupe(visualRated.length ? visualRated : visual),
    ...dedupe(activeRated.length ? activeRated : active),
  ];

  const usedVisual = !soldDataAvailable && visual.length >= 3;

  return {
    comps: ordered.slice(0, 25),
    soldDataAvailable,
    visualMatchCount: visual.length,
    suggestedPrice: median(prices),
    priceLow: prices.length ? Math.min(...prices) : undefined,
    priceHigh: prices.length ? Math.max(...prices) : undefined,
    note: soldDataAvailable
      ? `Based on ${sold.length} actual sold ${sold.length === 1 ? "item" : "items"} on eBay.`
      : usedVisual
        ? `Asking prices, not confirmed sales: matched ${visual.length} visually similar listings from your photo. eBay's sold-price API is a Limited Release this account does not have.`
        : activeRated.length >= 3
          ? `Asking prices, not confirmed sales: based on ${activeRated.length} active listings from sellers with 98%+ feedback.`
          : active.length || visual.length
            ? `Weak signal: only ${active.length + visual.length} comparable active listings found, and no access to sold prices.`
            : "No comparable eBay listings found for this item.",
  };
}

// ---------------------------------------------------------------------------
// Publishing: create and list an item on eBay via the Inventory API
// ---------------------------------------------------------------------------

export interface PublishReadiness {
  ready: boolean;
  hasPaymentPolicy: boolean;
  hasFulfillmentPolicy: boolean;
  hasReturnPolicy: boolean;
  hasLocation: boolean;
  missing: string[];
}

async function ebayGet<T>(pathname: string, tokens: EbayTokens): Promise<T | null> {
  const res = await fetch(`${API_BASE[tokens.env]}${pathname}`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * eBay refuses to publish an offer unless the seller has payment, return and
 * fulfillment business policies plus an inventory location. Check up front so
 * we can tell the seller exactly what to set up instead of failing at publish.
 */
export async function checkPublishReadiness(): Promise<PublishReadiness> {
  const tokens = await getValidTokens();
  const q = `?marketplace_id=${MARKETPLACE_ID}`;

  const [payment, fulfillment, returnPol, locations] = await Promise.all([
    ebayGet<{ paymentPolicies?: unknown[] }>(`/sell/account/v1/payment_policy${q}`, tokens),
    ebayGet<{ fulfillmentPolicies?: unknown[] }>(`/sell/account/v1/fulfillment_policy${q}`, tokens),
    ebayGet<{ returnPolicies?: unknown[] }>(`/sell/account/v1/return_policy${q}`, tokens),
    ebayGet<{ locations?: unknown[] }>(`/sell/inventory/v1/location`, tokens),
  ]);

  const hasPaymentPolicy = Boolean(payment?.paymentPolicies?.length);
  const hasFulfillmentPolicy = Boolean(fulfillment?.fulfillmentPolicies?.length);
  const hasReturnPolicy = Boolean(returnPol?.returnPolicies?.length);
  const hasLocation = Boolean(locations?.locations?.length);

  const missing: string[] = [];
  if (!hasPaymentPolicy) missing.push("payment policy");
  if (!hasFulfillmentPolicy) missing.push("shipping (fulfillment) policy");
  if (!hasReturnPolicy) missing.push("return policy");
  if (!hasLocation) missing.push("inventory location");

  return {
    ready: missing.length === 0,
    hasPaymentPolicy,
    hasFulfillmentPolicy,
    hasReturnPolicy,
    hasLocation,
    missing,
  };
}

interface PolicyIds {
  paymentPolicyId: string;
  fulfillmentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
}

async function resolvePolicies(tokens: EbayTokens): Promise<PolicyIds> {
  const q = `?marketplace_id=${MARKETPLACE_ID}`;
  const [payment, fulfillment, returnPol, locations] = await Promise.all([
    ebayGet<{ paymentPolicies?: { paymentPolicyId: string }[] }>(
      `/sell/account/v1/payment_policy${q}`,
      tokens
    ),
    ebayGet<{ fulfillmentPolicies?: { fulfillmentPolicyId: string }[] }>(
      `/sell/account/v1/fulfillment_policy${q}`,
      tokens
    ),
    ebayGet<{ returnPolicies?: { returnPolicyId: string }[] }>(
      `/sell/account/v1/return_policy${q}`,
      tokens
    ),
    ebayGet<{ locations?: { merchantLocationKey: string }[] }>(
      `/sell/inventory/v1/location`,
      tokens
    ),
  ]);

  const paymentPolicyId = payment?.paymentPolicies?.[0]?.paymentPolicyId;
  const fulfillmentPolicyId = fulfillment?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  const returnPolicyId = returnPol?.returnPolicies?.[0]?.returnPolicyId;
  const merchantLocationKey = locations?.locations?.[0]?.merchantLocationKey;

  if (!paymentPolicyId || !fulfillmentPolicyId || !returnPolicyId || !merchantLocationKey) {
    const readiness = await checkPublishReadiness();
    throw new Error(
      `eBay needs these set up on your seller account before it can publish: ${readiness.missing.join(", ")}. Set them in My eBay > Account > Business Policies.`
    );
  }
  return { paymentPolicyId, fulfillmentPolicyId, returnPolicyId, merchantLocationKey };
}

/** Ask eBay which category best fits this title. */
async function suggestCategoryId(title: string, tokens: EbayTokens): Promise<string | null> {
  const tree = await ebayGet<{ categoryTreeId?: string }>(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE_ID}`,
    tokens
  );
  if (!tree?.categoryTreeId) return null;
  const suggestions = await ebayGet<{
    categorySuggestions?: { category?: { categoryId?: string } }[];
  }>(
    `/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(title.slice(0, 80))}`,
    tokens
  );
  return suggestions?.categorySuggestions?.[0]?.category?.categoryId ?? null;
}

/** Map our free-text condition onto an eBay condition enum. */
function ebayCondition(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes("new with tag") || c.includes("nwt") || c.includes("deadstock")) return "NEW";
  if (c.includes("new without") || c.includes("nwot")) return "NEW_OTHER";
  if (c.includes("like new") || c.includes("excellent")) return "LIKE_NEW";
  if (c.includes("very good")) return "VERY_GOOD";
  if (c.includes("good")) return "GOOD";
  if (c.includes("acceptable") || c.includes("fair") || c.includes("poor")) return "ACCEPTABLE";
  return "USED_EXCELLENT";
}

async function ebaySend(
  method: "POST" | "PUT",
  pathname: string,
  body: unknown,
  tokens: EbayTokens
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${API_BASE[tokens.env]}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Pull a readable message out of eBay's error envelope. */
function ebayError(step: string, r: { status: number; json: Record<string, unknown>; text: string }) {
  const errors = (r.json?.errors ?? []) as { message?: string; longMessage?: string }[];
  const detail =
    errors.map((e) => e.longMessage || e.message).filter(Boolean).join("; ") ||
    r.text.slice(0, 300) ||
    `HTTP ${r.status}`;
  return new Error(`${step} failed: ${detail}`);
}

export interface PublishInput {
  sku: string;
  title: string;
  description: string;
  price: number;
  condition: string;
  imageUrls: string[];
  quantity?: number;
}

export interface PublishResult {
  listingId: string;
  offerId: string;
  sku: string;
  url: string;
}

/**
 * Create and publish a real, buyable eBay listing. Inventory item -> offer ->
 * publish. Anything already existing under this SKU is replaced.
 */
export async function publishToEbay(input: PublishInput): Promise<PublishResult> {
  const tokens = await getValidTokens();
  if (input.imageUrls.length === 0) {
    throw new Error("eBay requires at least one photo URL to publish a listing");
  }

  const policies = await resolvePolicies(tokens);

  // 1. Inventory item
  const invRes = await ebaySend(
    "PUT",
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`,
    {
      availability: {
        shipToLocationAvailability: { quantity: Math.max(1, input.quantity ?? 1) },
      },
      condition: ebayCondition(input.condition),
      product: {
        title: input.title.slice(0, 80),
        description: input.description,
        imageUrls: input.imageUrls.slice(0, 12),
      },
    },
    tokens
  );
  if (!invRes.ok) throw ebayError("Creating the eBay inventory item", invRes);

  // 2. Offer
  const categoryId = await suggestCategoryId(input.title, tokens);
  const offerRes = await ebaySend(
    "POST",
    `/sell/inventory/v1/offer`,
    {
      sku: input.sku,
      marketplaceId: MARKETPLACE_ID,
      format: "FIXED_PRICE",
      availableQuantity: Math.max(1, input.quantity ?? 1),
      ...(categoryId ? { categoryId } : {}),
      listingDescription: input.description,
      pricingSummary: { price: { value: input.price.toFixed(2), currency: "USD" } },
      listingPolicies: {
        paymentPolicyId: policies.paymentPolicyId,
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
        returnPolicyId: policies.returnPolicyId,
      },
      merchantLocationKey: policies.merchantLocationKey,
    },
    tokens
  );
  if (!offerRes.ok) throw ebayError("Creating the eBay offer", offerRes);
  const offerId = offerRes.json.offerId as string;
  if (!offerId) throw new Error("eBay didn't return an offer id");

  // 3. Publish — this is the point the listing goes live and becomes buyable
  const pubRes = await ebaySend(
    "POST",
    `/sell/inventory/v1/offer/${offerId}/publish`,
    {},
    tokens
  );
  if (!pubRes.ok) throw ebayError("Publishing the eBay listing", pubRes);

  const listingId = String(pubRes.json.listingId ?? "");
  return {
    listingId,
    offerId,
    sku: input.sku,
    url: listingId
      ? `https://www.${tokens.env === "sandbox" ? "sandbox." : ""}ebay.com/itm/${listingId}`
      : "",
  };
}

// ---------------------------------------------------------------------------
// Live listing sync: pull every listing on the account, not just ones made here
// ---------------------------------------------------------------------------

/**
 * Enumerating a seller's existing listings still means the legacy Trading
 * API. The modern Inventory API's getOffers only sees listings created
 * through that same API, so it misses anything listed in the eBay app or web
 * UI, which is most of what a normal seller has. Trading is XML and eBay has
 * been trimming it, so it is kept behind this one function to swap later.
 */
const TRADING_ENDPOINT: Record<EbayEnv, string> = {
  production: "https://api.ebay.com/ws/api.dll",
  sandbox: "https://api.sandbox.ebay.com/ws/api.dll",
};

export interface EbayLiveListing {
  itemId: string;
  title: string;
  price: number;
  quantity: number;
  quantitySold: number;
  listedAt?: string;
  endsAt?: string;
  soldAt?: string;
  soldPrice?: number;
  watchers?: number;
  status: "active" | "sold" | "ended";
  imageUrl?: string;
  url?: string;
}

async function tradingCall(
  callName: string,
  innerXml: string,
  tokens: EbayTokens
): Promise<Record<string, unknown>> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  ${innerXml}
</${callName}Request>`;

  const res = await fetch(TRADING_ENDPOINT[tokens.env], {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      "X-EBAY-API-IAF-TOKEN": tokens.accessToken,
      "Content-Type": "text/xml",
    },
    body,
  });
  const text = await res.text();

  const { XMLParser } = await import("fast-xml-parser");
  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: true }).parse(text) as
    Record<string, Record<string, unknown>>;
  const root = parsed[`${callName}Response`];
  if (!root) throw new Error(`eBay returned an unreadable ${callName} response`);

  if (root.Ack === "Failure") {
    const errs = root.Errors;
    const first = Array.isArray(errs) ? errs[0] : errs;
    const msg =
      (first as Record<string, string> | undefined)?.LongMessage ??
      (first as Record<string, string> | undefined)?.ShortMessage ??
      "Unknown Trading API error";
    throw new Error(`eBay ${callName} failed: ${msg}`);
  }
  return root;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

interface TradingItem {
  ItemID?: string | number;
  Title?: string;
  QuantityAvailable?: number;
  Quantity?: number;
  ListingDetails?: { StartTime?: string; EndTime?: string; ViewItemURL?: string };
  SellingStatus?: {
    CurrentPrice?: number;
    QuantitySold?: number;
  };
  BuyItNowPrice?: number;
  StartPrice?: number;
  PictureDetails?: { GalleryURL?: string };
  WatchCount?: number;
  TransactionPrice?: number;
}

function mapTradingItem(it: TradingItem, status: EbayLiveListing["status"]): EbayLiveListing {
  const price =
    Number(it.SellingStatus?.CurrentPrice ?? it.BuyItNowPrice ?? it.StartPrice ?? 0) || 0;
  const sold = Number(it.SellingStatus?.QuantitySold ?? 0);
  return {
    itemId: String(it.ItemID ?? ""),
    title: String(it.Title ?? ""),
    price,
    quantity: Number(it.QuantityAvailable ?? it.Quantity ?? 0),
    quantitySold: sold,
    listedAt: it.ListingDetails?.StartTime,
    endsAt: it.ListingDetails?.EndTime,
    soldAt: status === "sold" ? it.ListingDetails?.EndTime : undefined,
    soldPrice: status === "sold" ? price : undefined,
    // Watch count only comes back on some calls; left undefined rather than
    // defaulted to 0 so "unknown" is not mistaken for "nobody is watching".
    watchers: it.WatchCount !== undefined ? Number(it.WatchCount) : undefined,
    status,
    imageUrl: it.PictureDetails?.GalleryURL,
    url: it.ListingDetails?.ViewItemURL,
  };
}

/**
 * Every active, sold and unsold listing on the connected account.
 * Paged at 200 per list, which covers a normal reseller's inventory.
 */
export async function fetchAllEbayListings(): Promise<EbayLiveListing[]> {
  const tokens = await getValidTokens();
  const page = `<Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`;
  const root = await tradingCall(
    "GetMyeBaySelling",
    `<ActiveList><Include>true</Include>${page}</ActiveList>
     <SoldList><Include>true</Include>${page}</SoldList>
     <UnsoldList><Include>true</Include>${page}</UnsoldList>
     <DetailLevel>ReturnAll</DetailLevel>`,
    tokens
  );

  const pick = (key: string) =>
    asArray(
      ((root[key] as Record<string, unknown> | undefined)?.ItemArray as
        | { Item?: TradingItem | TradingItem[] }
        | undefined)?.Item
    );

  return [
    ...pick("ActiveList").map((i) => mapTradingItem(i, "active")),
    ...pick("SoldList").map((i) => mapTradingItem(i, "sold")),
    ...pick("UnsoldList").map((i) => mapTradingItem(i, "ended")),
  ].filter((l) => l.itemId);
}

// ---------------------------------------------------------------------------
// Revising a live listing in place
// ---------------------------------------------------------------------------

/**
 * Change the price and/or title of a listing that is already live.
 *
 * Deliberately a revise rather than an end-and-relist: revising keeps the
 * watchers and question history attached to the listing, avoids insertion
 * fees, and stays clear of eBay's search-manipulation rules, which treat
 * repeatedly recycling listings to reset their exposure as abuse.
 */
export async function reviseEbayListing(
  itemId: string,
  changes: { price?: number; title?: string; description?: string }
): Promise<void> {
  const tokens = await getValidTokens();
  const parts: string[] = [`<ItemID>${itemId}</ItemID>`];
  if (changes.title) parts.push(`<Title><![CDATA[${changes.title.slice(0, 80)}]]></Title>`);
  if (changes.description)
    parts.push(`<Description><![CDATA[${changes.description}]]></Description>`);
  if (changes.price !== undefined && changes.price > 0)
    parts.push(`<StartPrice>${changes.price.toFixed(2)}</StartPrice>`);

  if (parts.length === 1) throw new Error("Nothing to revise on this listing");

  await tradingCall("ReviseItem", `<Item>${parts.join("")}</Item>`, tokens);
}
