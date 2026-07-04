import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";

export interface Highlight {
  /** Timestamp (seconds) of the loudness peak */
  time: number;
  /** 0-1 relative loudness score */
  score: number;
  /** Suggested clip window */
  suggestedStart: number;
  suggestedEnd: number;
}

export type ClipStatus =
  | "queued"
  | "cutting"
  | "transcribing"
  | "captioning"
  | "end_card"
  | "writing_hooks"
  | "ready"
  | "error";

export interface PromoSettings {
  enabled: boolean;
  headline: string;
  code: string;
  subline: string;
  /** Accent hex color for the code line, e.g. "#8b5cf6" */
  accent: string;
  durationSec: number;
}

export const DEFAULT_PROMO: PromoSettings = {
  enabled: true,
  headline: "JOIN THE LEADERBOARD",
  code: "CODE: lmb1",
  subline: "Sign up with code lmb1 to enter",
  accent: "#8b5cf6",
  durationSec: 3.5,
};

export interface Clip {
  id: string;
  videoId: string;
  start: number;
  end: number;
  cropMode: "crop" | "blur";
  captions: boolean;
  /** Append the promo end card to this clip */
  endCard?: boolean;
  /** Optional user context passed to the hook generator (game name, bet size, outcome...) */
  notes?: string;
  status: ClipStatus;
  error?: string;
  /** Path relative to DATA_DIR, servable via /api/media */
  file?: string;
  transcript?: string;
  hooks?: string[];
  caption?: string;
  createdAt: string;
}

export interface Video {
  id: string;
  filename: string;
  /** Path relative to DATA_DIR, servable via /api/media */
  file: string;
  duration: number;
  highlights?: Highlight[];
  createdAt: string;
}

interface Store {
  videos: Video[];
  clips: Clip[];
  promo?: PromoSettings;
}

function read(): Store {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { videos: [], clips: [] };
  }
}

export function getPromoSettings(): PromoSettings {
  return { ...DEFAULT_PROMO, ...read().promo };
}

export function updatePromoSettings(patch: Partial<PromoSettings>): PromoSettings {
  const store = read();
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  store.promo = { ...DEFAULT_PROMO, ...store.promo, ...defined };
  write(store);
  return store.promo;
}

function write(store: Store) {
  ensureDirs();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export function listVideos(): Video[] {
  return read().videos;
}

export function getVideo(id: string): Video | undefined {
  return read().videos.find((v) => v.id === id);
}

export function addVideo(video: Video) {
  const store = read();
  store.videos.unshift(video);
  write(store);
}

export function updateVideo(id: string, patch: Partial<Video>) {
  const store = read();
  const video = store.videos.find((v) => v.id === id);
  if (!video) return;
  Object.assign(video, patch);
  write(store);
}

export function deleteVideo(id: string) {
  const store = read();
  store.videos = store.videos.filter((v) => v.id !== id);
  store.clips = store.clips.filter((c) => c.videoId !== id);
  write(store);
}

export function listClips(videoId?: string): Clip[] {
  const clips = read().clips;
  return videoId ? clips.filter((c) => c.videoId === videoId) : clips;
}

export function getClip(id: string): Clip | undefined {
  return read().clips.find((c) => c.id === id);
}

export function addClip(clip: Clip) {
  const store = read();
  store.clips.unshift(clip);
  write(store);
}

export function updateClip(id: string, patch: Partial<Clip>) {
  const store = read();
  const clip = store.clips.find((c) => c.id === id);
  if (!clip) return;
  Object.assign(clip, patch);
  write(store);
}

export function deleteClip(id: string) {
  const store = read();
  store.clips = store.clips.filter((c) => c.id !== id);
  write(store);
}
