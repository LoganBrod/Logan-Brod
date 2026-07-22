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
  comps?: Comps;
  brainScore?: BrainScore;
  diagnosis?: Diagnosis;
  /** "control" or the id of the active experiment this listing tests */
  experimentId?: string;
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

interface Store {
  listings: Listing[];
  seller?: SellerSettings;
  playbook?: Playbook;
  seedListings?: SeedListing[];
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

/** Days from listing to sale (or to now for unsold), null-safe */
export function daysListed(l: Listing): number | null {
  const start = l.outcome?.listedAt ? Date.parse(l.outcome.listedAt) : NaN;
  if (!isFinite(start)) return null;
  const end = l.outcome?.soldAt ? Date.parse(l.outcome.soldAt) : Date.now();
  if (!isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}
