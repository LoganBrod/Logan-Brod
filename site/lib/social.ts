// Closets other people can see, and the one signal they can leave on them.
//
// Everything else in this app is private by construction: a closet lives under
// a six-character code, and the only way to it is to hold that code. Publishing
// is the deliberate exception, and it is opt-in per closet rather than a
// setting on an account — you decide about *this* closet, at the moment you
// decide, and you can take it back.
//
// A like is the whole of the social surface on purpose. Comments would need
// moderation, and moderation is a staffing commitment rather than a feature.
// A count of people who liked a closet is the most signal available for the
// least obligation.

import { getJson, redisConfigured, setJson } from "./redis";
import { isValidCode } from "./closet";
import type { Owner } from "./library";

/** One closet on the discover page. Not the closet itself — this renders a card. */
export interface PublicCloset {
  code: string;
  /** What the publisher called it. */
  name: string;
  /** Who published it, as they chose to be known. Never an email. */
  by: string;
  publishedAt: string;
  itemCount: number;
  range: { min: number; max: number };
  /** Up to four thumbnails, so a card can show the closet rather than describe it. */
  preview: string[];
  /** Denormalised so the feed doesn't fan out into a read per closet. */
  likes: number;
}

/**
 * How many closets the feed holds.
 *
 * The feed is one Redis value read and rewritten on every publish, which is
 * fine at this size and is not fine at ten times it. When this needs to be
 * bigger it needs a real index, not a bigger number — so it stays small enough
 * that the limitation is obvious rather than lurking.
 */
const FEED_LIMIT = 60;

const FEED_KEY = "social:feed";

function likesKey(code: string): string {
  return `social:likes:${code}`;
}

function likedByKey(owner: Owner): string {
  const base = owner.kind === "user" ? `user:${owner.id}` : `taste:${owner.id}`;
  return `${base}:liked`;
}

/** The display name a closet is published under. */
export function cleanDisplayName(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  // Collapsed, trimmed, and short. An empty result is handled by the caller
  // rather than defaulted here, because "Anonymous" is a decision about the
  // product, not about string cleaning.
  return raw.replace(/\s+/g, " ").trim().slice(0, 40);
}

export async function readFeed(): Promise<PublicCloset[]> {
  if (!redisConfigured()) return [];
  try {
    const feed = await getJson<PublicCloset[]>(FEED_KEY);
    return Array.isArray(feed) ? feed : [];
  } catch {
    return [];
  }
}

async function writeFeed(feed: PublicCloset[]): Promise<void> {
  await setJson(FEED_KEY, feed.slice(0, FEED_LIMIT));
}

/**
 * Put a closet in the feed, or update the entry that's already there.
 *
 * Republishing is an update rather than a duplicate, and it does not move the
 * closet back to the top: a feed you can bump by pressing a button twice stops
 * being a feed and starts being a leaderboard for whoever is most bored.
 */
export async function publish(entry: Omit<PublicCloset, "likes" | "publishedAt">): Promise<PublicCloset | null> {
  if (!redisConfigured() || !isValidCode(entry.code)) return null;

  const feed = await readFeed();
  const existing = feed.find((item) => item.code === entry.code);

  const published: PublicCloset = {
    ...entry,
    preview: entry.preview.slice(0, 4),
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
    likes: existing?.likes ?? (await countLikes(entry.code)),
  };

  await writeFeed(
    existing
      ? feed.map((item) => (item.code === entry.code ? published : item))
      : [published, ...feed]
  );
  return published;
}

/** Take a closet back out of the feed. The closet itself is untouched. */
export async function unpublish(code: string): Promise<boolean> {
  if (!redisConfigured()) return false;
  const feed = await readFeed();
  if (!feed.some((item) => item.code === code)) return false;
  await writeFeed(feed.filter((item) => item.code !== code));
  return true;
}

export function isPublished(feed: PublicCloset[], code: string): boolean {
  return feed.some((item) => item.code === code);
}

// ------------------------------------------------------------------- likes

/**
 * Who this person has liked.
 *
 * Stored per liker rather than per closet, which is the direction that gets
 * read on every page render: the feed needs "did I like each of these", and
 * one read answers it for all of them. The count on the closet is kept
 * separately and denormalised into the feed entry.
 */
export async function readLiked(owner: Owner | null): Promise<string[]> {
  if (!owner || !redisConfigured()) return [];
  try {
    const liked = await getJson<string[]>(likedByKey(owner));
    return Array.isArray(liked) ? liked : [];
  } catch {
    return [];
  }
}

async function countLikes(code: string): Promise<number> {
  if (!redisConfigured()) return 0;
  try {
    return Number((await getJson<number>(likesKey(code))) ?? 0);
  } catch {
    return 0;
  }
}

export interface LikeResult {
  liked: boolean;
  likes: number;
}

/**
 * Like or unlike, idempotently.
 *
 * The liker's own list is the source of truth for whether they've liked
 * something, and the count is derived from it rather than incremented blindly —
 * so a double-tap, a retried request, or two tabs can't inflate a closet's
 * total. That matters more than the extra write: a count nobody can trust is
 * worse than no count.
 */
export async function setLike(
  owner: Owner,
  code: string,
  wanted: boolean
): Promise<LikeResult | null> {
  if (!redisConfigured() || !isValidCode(code)) return null;

  const liked = await readLiked(owner);
  const already = liked.includes(code);
  const count = await countLikes(code);

  if (already === wanted) return { liked: already, likes: count };

  const next = wanted ? [code, ...liked] : liked.filter((item) => item !== code);
  // Never below zero, however inconsistent the stored count has become.
  const likes = Math.max(0, wanted ? count + 1 : count - 1);

  await Promise.all([setJson(likedByKey(owner), next), setJson(likesKey(code), likes)]);

  // The feed carries a copy so the list can render without a read per closet;
  // it is a cache of the number above, and the number above wins.
  const feed = await readFeed();
  if (feed.some((item) => item.code === code)) {
    await writeFeed(feed.map((item) => (item.code === code ? { ...item, likes } : item)));
  }

  return { liked: wanted, likes };
}

/**
 * The feed as this person sees it: newest first, with their own likes marked.
 *
 * Sorting happens here rather than on write so that the stored order stays the
 * publish order — which is what makes republishing a no-op for position.
 */
export function decorate(
  feed: PublicCloset[],
  liked: string[]
): Array<PublicCloset & { likedByYou: boolean }> {
  const mine = new Set(liked);
  return [...feed]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((item) => ({ ...item, likedByYou: mine.has(item.code) }));
}
