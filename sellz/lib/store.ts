import { readRaw, writeRaw } from "./db";

export type Platform = "ebay" | "depop" | "other";
export type ListingStatus = "draft" | "active" | "sold" | "stale" | "ended";

export interface ListingOutcome {
  views: number;
  watchers: number;
  offers: number;
  soldPrice?: number;
  listedAt?: string;
  soldAt?: string;
  updatedAt: string;
}

/** What it cost to acquire and move an item — drives profit and margin. */
export interface CostBasis {
  /** What you paid for the item */
  purchasePrice?: number;
  /** Shipping you paid out (postage, packaging) */
  shippingCost?: number;
  /** Marketplace + payment fees */
  fees?: number;
  /** Where you sourced it, for spotting which sources pay off */
  source?: string;
  updatedAt: string;
}

export interface Comps {
  summary: string;
  priceLow?: number;
  priceHigh?: number;
  demandNotes: string;
  sources: string[];
  /** User-pasted comps when web research can't reach sold data */
  manualNotes?: string;
  at: string;
}

export interface BrainScore {
  score: number;
  reason: string;
  at: string;
}

export interface Diagnosis {
  /** Why this listing isn't selling */
  text: string;
  rewrittenTitle: string;
  rewrittenDescription: string;
  suggestedPrice: number;
  at: string;
}

export interface Listing {
  id: string;
  platform: Platform;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  tags: string[];
  /** What the photos show (or should show) */
  photosNote: string;
  status: ListingStatus;
  source: "imported" | "generated";
  outcome?: ListingOutcome;
  cost?: CostBasis;
  comps?: Comps;
  brainScore?: BrainScore;
  diagnosis?: Diagnosis;
  /** "control" or the id of the active experiment this listing tests */
  experimentId?: string;
  /** Real eBay item ID (from the listing's URL) — lets us auto-sync outcome data */
  ebayItemId?: string;
  /** Stored photo ids (front, back, extras) served from /api/photos/[id] */
  photos?: string[];
  /** Set once we've published this listing to eBay from here */
  publishedAt?: string;
  /** SKU we generated when publishing via the eBay Inventory API */
  ebaySku?: string;
  createdAt: string;
}

export interface Experiment {
  id: string;
  hypothesis: string;
  instruction: string;
}

export interface Playbook {
  updatedAt: string;
  summary: string;
  /** Titles, keywords, descriptions, photos */
  listingGuidelines: string;
  /** Pricing patterns that sold */
  pricingGuidelines: string;
  avoid: string;
  experiments?: Experiment[];
  experimentResults?: string;
}

/** A reference listing (someone else's sale) fed to the Brain */
export interface SeedListing {
  id: string;
  description: string;
  source?: string;
  stats?: string;
  addedAt: string;
}

export interface SellerSettings {
  /** What you sell */
  niche: string;
  /** Platforms you list on */
  platforms: string;
  /** Shipping approach (affects listings) */
  shipping: string;
  /** Shop voice/style */
  style: string;
}

export const DEFAULT_SELLER: SellerSettings = {
  niche: "",
  platforms: "eBay, Depop",
  shipping: "",
  style: "honest, detailed, no fluff",
};

export type ProposalKind = "reprice" | "retitle" | "rewrite" | "relist" | "hold";
export type ProposalStatus = "pending" | "approved" | "dismissed" | "applied" | "failed";

/**
 * A single suggested change to a live listing, produced by the background
 * research pass. Nothing is ever applied to eBay without the seller
 * approving it, which is why status starts at "pending".
 */
export interface Proposal {
  id: string;
  listingId: string;
  kind: ProposalKind;
  /** One line the seller reads before deciding */
  summary: string;
  /** Why, in terms of the evidence that produced it */
  rationale: string;
  currentPrice?: number;
  proposedPrice?: number;
  currentTitle?: string;
  proposedTitle?: string;
  proposedDescription?: string;
  /** 0-100 confidence from the Brain */
  confidence: number;
  status: ProposalStatus;
  error?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface EbayTokens {
  env: "sandbox" | "production";
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp the access token expires at */
  accessTokenExpiresAt: string;
  connectedAt: string;
}

interface Store {
  listings: Listing[];
  seller?: SellerSettings;
  playbook?: Playbook;
  seedListings?: SeedListing[];
  ebay?: EbayTokens;
  proposals?: Proposal[];
  lastResearchAt?: string;
}

async function read(): Promise<Store> {
  const raw = await readRaw();
  if (!raw) return { listings: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { listings: [] };
  }
}

async function write(store: Store) {
  await writeRaw(JSON.stringify(store, null, 2));
}

export async function listListings(): Promise<Listing[]> {
  return (await read()).listings;
}

export async function getListing(id: string): Promise<Listing | undefined> {
  return (await read()).listings.find((l) => l.id === id);
}

export async function addListing(listing: Listing) {
  const store = await read();
  store.listings.unshift(listing);
  await write(store);
}

export async function updateListing(id: string, patch: Partial<Listing>) {
  const store = await read();
  const listing = store.listings.find((l) => l.id === id);
  if (!listing) return;
  Object.assign(listing, patch);
  await write(store);
}

export async function deleteListing(id: string) {
  const store = await read();
  store.listings = store.listings.filter((l) => l.id !== id);
  await write(store);
}

export async function getSellerSettings(): Promise<SellerSettings> {
  return { ...DEFAULT_SELLER, ...(await read()).seller };
}

export async function updateSellerSettings(
  patch: Partial<SellerSettings>
): Promise<SellerSettings> {
  const store = await read();
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  store.seller = { ...DEFAULT_SELLER, ...store.seller, ...defined };
  await write(store);
  return store.seller;
}

export async function getPlaybook(): Promise<Playbook | undefined> {
  return (await read()).playbook;
}

export async function setPlaybook(playbook: Playbook) {
  const store = await read();
  store.playbook = playbook;
  await write(store);
}

export async function listSeedListings(): Promise<SeedListing[]> {
  return (await read()).seedListings ?? [];
}

export async function addSeedListing(seed: SeedListing) {
  const store = await read();
  store.seedListings = [seed, ...(store.seedListings ?? [])].slice(0, 50);
  await write(store);
}

export async function deleteSeedListing(id: string) {
  const store = await read();
  store.seedListings = (store.seedListings ?? []).filter((s) => s.id !== id);
  await write(store);
}

export async function listProposals(): Promise<Proposal[]> {
  return (await read()).proposals ?? [];
}

export async function getProposal(id: string): Promise<Proposal | undefined> {
  return (await read()).proposals?.find((p) => p.id === id);
}

/**
 * Replaces any still-pending proposal for the same listing and kind, so a
 * repeated research pass refreshes advice rather than stacking duplicates.
 * Decided proposals are kept as history.
 */
export async function upsertProposal(proposal: Proposal) {
  const store = await read();
  const kept = (store.proposals ?? []).filter(
    (p) =>
      !(p.listingId === proposal.listingId && p.kind === proposal.kind && p.status === "pending")
  );
  store.proposals = [proposal, ...kept].slice(0, 300);
  await write(store);
}

export async function updateProposal(id: string, patch: Partial<Proposal>) {
  const store = await read();
  const p = store.proposals?.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  await write(store);
}

export async function setLastResearchAt(iso: string) {
  const store = await read();
  store.lastResearchAt = iso;
  await write(store);
}

export async function getLastResearchAt(): Promise<string | undefined> {
  return (await read()).lastResearchAt;
}

export async function getEbayTokens(): Promise<EbayTokens | undefined> {
  return (await read()).ebay;
}

export async function setEbayTokens(tokens: EbayTokens) {
  const store = await read();
  store.ebay = tokens;
  await write(store);
}

export async function clearEbayTokens() {
  const store = await read();
  delete store.ebay;
  await write(store);
}

export interface Profit {
  revenue: number;
  cost: number;
  profit: number;
  /** Profit as a % of revenue. Null when there's no revenue to divide by. */
  marginPct: number | null;
  /** True only when we know both what it sold for and what it cost */
  complete: boolean;
}

/**
 * Profit for one listing. Only meaningful once it's sold and has a cost
 * basis; `complete` says whether both halves are actually known so callers
 * can avoid quoting a margin that's really just "we don't know the cost".
 */
export function listingProfit(l: Listing): Profit | null {
  const revenue = l.outcome?.soldPrice;
  if (l.status !== "sold" || revenue === undefined) return null;

  const purchase = l.cost?.purchasePrice;
  const shipping = l.cost?.shippingCost ?? 0;
  const fees = l.cost?.fees ?? 0;
  const cost = (purchase ?? 0) + shipping + fees;
  const profit = revenue - cost;

  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    complete: purchase !== undefined,
  };
}

/** Days from listing to sale (or to now for unsold), null-safe */
export function daysListed(l: Listing): number | null {
  const start = l.outcome?.listedAt ? Date.parse(l.outcome.listedAt) : NaN;
  if (!isFinite(start)) return null;
  const end = l.outcome?.soldAt ? Date.parse(l.outcome.soldAt) : Date.now();
  if (!isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}
