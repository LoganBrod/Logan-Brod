import fs from "fs";
import { STORE_PATH, ensureDirs } from "./paths";

export type HighlightSource = "audio" | "ai" | "youtube";

export interface Highlight {
  /** Timestamp (seconds) of the moment */
  time: number;
  /** 0-1 relative intensity score */
  score: number;
  /** Suggested clip window */
  suggestedStart: number;
  suggestedEnd: number;
  /** Where this suggestion came from */
  source: HighlightSource;
  /** Short description, e.g. "hilarious mis-play reaction" (AI scan) */
  label?: string;
}

export type ClipStatus =
  | "queued"
  | "cutting"
  | "transcribing"
  | "captioning"
  | "end_card"
  | "writing_hooks"
  | "posting"
  | "ready"
  | "error";

export interface PostedInfo {
  platform: "x";
  id: string;
  url: string;
  at: string;
}

export interface ClipMetrics {
  views: number;
  likes: number;
  reposts: number;
  updatedAt: string;
}

export interface LiveEvent {
  at: string;
  type: "info" | "spike" | "clip" | "error";
  text: string;
  clipId?: string;
}

export interface LiveSession {
  id: string;
  /** Kick channel slug or a direct m3u8 URL */
  channel: string;
  status: "connecting" | "live" | "stopped" | "error";
  error?: string;
  /** The Video record the live recording grows into */
  videoId: string;
  startedAt: string;
  stoppedAt?: string;
  events: LiveEvent[];
}

export interface Playbook {
  updatedAt: string;
  summary: string;
  momentGuidelines: string;
  hookGuidelines: string;
  avoid: string;
}

export interface PromoSettings {
  enabled: boolean;
  /** Small line above the main text, e.g. "ENJOYED THIS?" */
  headline: string;
  /** The big accent line, e.g. "@yourname" or "CODE: lmb1" */
  main: string;
  /** Supporting line, e.g. "Live every day at 7PM EST" */
  subline: string;
  /** Where to find you: twitch.tv/x · kick.com/x · youtube.com/@x */
  socials: string;
  /** Optional small footer, e.g. "18+ | Gamble responsibly" for casino content */
  footer: string;
  /** Accent hex color for the main line, e.g. "#2dd4bf" */
  accent: string;
  durationSec: number;
}

export const DEFAULT_PROMO: PromoSettings = {
  enabled: true,
  headline: "ENJOYED THIS?",
  main: "@yourname",
  subline: "Follow for daily clips",
  socials: "twitch.tv/yourname · youtube.com/@yourname",
  footer: "",
  accent: "#2dd4bf",
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
  /** Post to X automatically once processing finishes */
  autoPost?: boolean;
  status: ClipStatus;
  error?: string;
  /** Path relative to DATA_DIR, servable via /api/media */
  file?: string;
  transcript?: string;
  hooks?: string[];
  caption?: string;
  posted?: PostedInfo;
  metrics?: ClipMetrics;
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
  autoPost?: boolean;
  liveSessions?: LiveSession[];
  playbook?: Playbook;
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

/** Replace one source's highlight suggestions, keeping the others. */
export function mergeHighlights(
  videoId: string,
  source: HighlightSource,
  items: Highlight[]
) {
  const store = read();
  const video = store.videos.find((v) => v.id === videoId);
  if (!video) return;
  video.highlights = [
    ...(video.highlights ?? []).filter((h) => h.source !== source),
    ...items,
  ].sort((a, b) => a.time - b.time);
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

export function getAutoPost(): boolean {
  return read().autoPost === true;
}

export function setAutoPost(value: boolean) {
  const store = read();
  store.autoPost = value;
  write(store);
}

export function listLiveSessions(): LiveSession[] {
  return read().liveSessions ?? [];
}

export function getLiveSession(id: string): LiveSession | undefined {
  return listLiveSessions().find((s) => s.id === id);
}

export function addLiveSession(session: LiveSession) {
  const store = read();
  store.liveSessions = [session, ...(store.liveSessions ?? [])];
  write(store);
}

export function updateLiveSession(id: string, patch: Partial<LiveSession>) {
  const store = read();
  const session = (store.liveSessions ?? []).find((s) => s.id === id);
  if (!session) return;
  Object.assign(session, patch);
  write(store);
}

export function pushLiveEvent(id: string, event: LiveEvent) {
  const store = read();
  const session = (store.liveSessions ?? []).find((s) => s.id === id);
  if (!session) return;
  session.events = [...session.events, event].slice(-100);
  write(store);
}

export function deleteLiveSession(id: string) {
  const store = read();
  store.liveSessions = (store.liveSessions ?? []).filter((s) => s.id !== id);
  write(store);
}

export function getPlaybook(): Playbook | undefined {
  return read().playbook;
}

export function setPlaybook(playbook: Playbook) {
  const store = read();
  store.playbook = playbook;
  write(store);
}
