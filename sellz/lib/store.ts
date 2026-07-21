import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";

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

function read(): Store {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { listings: [] };
  }
}

function write(store: Store) {
  ensureDirs();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export function listListings(): Listing[] {
  return read().listings;
}

export function getListing(id: string): Listing | undefined {
  return read().listings.find((l) => l.id === id);
}

export function addListing(listing: Listing) {
  const store = read();
  store.listings.unshift(listing);
  write(store);
}

export function updateListing(id: string, patch: Partial<Listing>) {
  const store = read();
  const listing = store.listings.find((l) => l.id === id);
  if (!listing) return;
  Object.assign(listing, patch);
  write(store);
}

export function deleteListing(id: string) {
  const store = read();
  store.listings = store.listings.filter((l) => l.id !== id);
  write(store);
}

export function getSellerSettings(): SellerSettings {
  return { ...DEFAULT_SELLER, ...read().seller };
}

export function updateSellerSettings(patch: Partial<SellerSettings>): SellerSettings {
  const store = read();
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  store.seller = { ...DEFAULT_SELLER, ...store.seller, ...defined };
  write(store);
  return store.seller;
}

export function getPlaybook(): Playbook | undefined {
  return read().playbook;
}

export function setPlaybook(playbook: Playbook) {
  const store = read();
  store.playbook = playbook;
  write(store);
}

export function listSeedListings(): SeedListing[] {
  return read().seedListings ?? [];
}

export function addSeedListing(seed: SeedListing) {
  const store = read();
  store.seedListings = [seed, ...(store.seedListings ?? [])].slice(0, 50);
  write(store);
}

export function deleteSeedListing(id: string) {
  const store = read();
  store.seedListings = (store.seedListings ?? []).filter((s) => s.id !== id);
  write(store);
}

/** Days from listing to sale (or to now for unsold), null-safe */
export function daysListed(l: Listing): number | null {
  const start = l.outcome?.listedAt ? Date.parse(l.outcome.listedAt) : NaN;
  if (!isFinite(start)) return null;
  const end = l.outcome?.soldAt ? Date.parse(l.outcome.soldAt) : Date.now();
  if (!isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}
