import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";

export type AdPlatform = "meta" | "tiktok" | "x" | "google" | "other";
export type AdFormat = "image" | "video";
export type AdStatus = "draft" | "active" | "ended";

export interface Scene {
  /** What's on screen — used as the image-generation prompt */
  visual: string;
  /** Spoken line for this scene */
  voiceover: string;
  /** Short text burned over the visual */
  overlayText: string;
}

export interface AdCreative {
  headline: string;
  primaryText: string;
  cta: string;
  /** What the image/video shows — for imported ads a description, for generated ads the image prompt */
  visualDescription: string;
  /** Scene-by-scene script for video ads */
  videoScript?: Scene[];
}

export interface AdMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  purchases: number;
  revenue: number;
  updatedAt: string;
}

export interface BrainScore {
  score: number;
  reason: string;
  at: string;
}

export type AssetStatus = "none" | "generating" | "ready" | "error";

export interface AdAssets {
  status: AssetStatus;
  error?: string;
  /** Paths relative to DATA_DIR, servable via /api/media */
  images: string[];
  video?: string;
  voiceover?: string;
}

export interface Ad {
  id: string;
  name: string;
  platform: AdPlatform;
  format: AdFormat;
  status: AdStatus;
  source: "imported" | "generated";
  creative: AdCreative;
  metrics?: AdMetrics;
  brainScore?: BrainScore;
  /** "control" or the id of the active experiment this ad tests */
  experimentId?: string;
  assets?: AdAssets;
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
  /** What converts: angles, hooks, offers, formats */
  creativeGuidelines: string;
  /** Visual patterns that perform */
  visualGuidelines: string;
  avoid: string;
  experiments?: Experiment[];
  experimentResults?: string;
}

/** A reference ad (someone else's winner) fed to the Brain */
export interface SeedAd {
  id: string;
  description: string;
  source?: string;
  stats?: string;
  addedAt: string;
}

export interface ProductSettings {
  /** What you're selling */
  product: string;
  /** Who you're selling it to */
  audience: string;
  /** The offer/price/angle */
  offer: string;
  /** Brand voice */
  voice: string;
}

export const DEFAULT_PRODUCT: ProductSettings = {
  product: "",
  audience: "",
  offer: "",
  voice: "confident, direct, no corporate fluff",
};

interface Store {
  ads: Ad[];
  product?: ProductSettings;
  playbook?: Playbook;
  seedAds?: SeedAd[];
}

function read(): Store {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { ads: [] };
  }
}

function write(store: Store) {
  ensureDirs();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export function listAds(): Ad[] {
  return read().ads;
}

export function getAd(id: string): Ad | undefined {
  return read().ads.find((a) => a.id === id);
}

export function addAd(ad: Ad) {
  const store = read();
  store.ads.unshift(ad);
  write(store);
}

export function updateAd(id: string, patch: Partial<Ad>) {
  const store = read();
  const ad = store.ads.find((a) => a.id === id);
  if (!ad) return;
  Object.assign(ad, patch);
  write(store);
}

export function deleteAd(id: string) {
  const store = read();
  store.ads = store.ads.filter((a) => a.id !== id);
  write(store);
}

export function getProductSettings(): ProductSettings {
  return { ...DEFAULT_PRODUCT, ...read().product };
}

export function updateProductSettings(patch: Partial<ProductSettings>): ProductSettings {
  const store = read();
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  store.product = { ...DEFAULT_PRODUCT, ...store.product, ...defined };
  write(store);
  return store.product;
}

export function getPlaybook(): Playbook | undefined {
  return read().playbook;
}

export function setPlaybook(playbook: Playbook) {
  const store = read();
  store.playbook = playbook;
  write(store);
}

export function listSeedAds(): SeedAd[] {
  return read().seedAds ?? [];
}

export function addSeedAd(seed: SeedAd) {
  const store = read();
  store.seedAds = [seed, ...(store.seedAds ?? [])].slice(0, 50);
  write(store);
}

export function deleteSeedAd(id: string) {
  const store = read();
  store.seedAds = (store.seedAds ?? []).filter((s) => s.id !== id);
  write(store);
}

/** Derived performance numbers, null-safe */
export function derived(m?: AdMetrics) {
  if (!m) return null;
  const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null;
  const cvr = m.clicks > 0 ? (m.purchases / m.clicks) * 100 : null;
  const roas = m.spend > 0 ? m.revenue / m.spend : null;
  const cpa = m.purchases > 0 ? m.spend / m.purchases : null;
  return { ctr, cvr, roas, cpa };
}
