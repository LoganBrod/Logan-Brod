// What this browser has already said yes and no to.
//
// The only direct signal the app ever gets about whether a recommendation was
// any good is someone pressing yes or no on it, so it's worth keeping. Votes
// accumulate per browser under a long-lived id and are rendered into a short
// memo that steers both the query writing and the picking on later runs.
//
// Storage is the same optional Upstash instance as the closet. Without it there
// is no memory and no vote control, and everything else still works — the same
// posture as saving.

import { randomUUID } from "node:crypto";
import { getJson, redisConfigured, setJson } from "./redis";

/** A year. Refreshed on every vote, so an active browser never loses its taste. */
export const TASTE_TTL_SECONDS = 365 * 24 * 60 * 60;

export const TASTE_COOKIE = "taste_id";

export type Verdict = "yes" | "no";

export interface Vote {
  /** The listing's title — what the model actually sees. */
  title: string;
  verdict: Verdict;
  at: string;
  source?: string;
  price?: number;
}

/**
 * How many votes are kept. Well past what the memo renders, so a run of yeses
 * can't push every earlier no out of the record — but bounded, because this is
 * one Redis value read and rewritten on every vote.
 */
const MAX_STORED = 60;

/**
 * How many of each verdict reach the prompt. Enough to show a pattern; small
 * enough that the memo stays a paragraph rather than a wall that drowns out the
 * photos it sits next to.
 */
const MEMO_PER_SIDE = 15;

/** eBay titles run to 80 characters of keyword stuffing; the front is the garment. */
const MAX_TITLE = 90;

function key(id: string): string {
  return `taste:${id}`;
}

/** Ids go straight into a Redis key, so only ever accept ones we could have minted. */
export function isValidTasteId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

export function newTasteId(): string {
  return randomUUID().replace(/-/g, "");
}

export function readTasteId(cookieHeader: string | null): string | null {
  const raw = cookieHeader?.match(new RegExp(`${TASTE_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  const id = decodeURIComponent(raw);
  return isValidTasteId(id) ? id : null;
}

/** Most recent first. */
export async function readVotes(id: string): Promise<Vote[]> {
  if (!isValidTasteId(id)) return [];
  const votes = await getJson<Vote[]>(key(id));
  return Array.isArray(votes) ? votes : [];
}

/**
 * Add one vote.
 *
 * Read-modify-write, so two votes cast in the same instant can lose one. That's
 * accepted: this is a single person tapping buttons, and a dropped vote costs a
 * line of a memo, not correctness.
 */
export async function recordVote(id: string, vote: Vote): Promise<void> {
  if (!isValidTasteId(id)) throw new Error("Invalid taste id.");
  const existing = await readVotes(id);
  const next = [vote, ...existing].slice(0, MAX_STORED);
  await setJson(key(id), next, TASTE_TTL_SECONDS);
}

/**
 * Render votes into the block that gets appended to a prompt.
 *
 * A title's most recent verdict is the one that counts, which is why this walks
 * newest-first and skips titles it has already placed — changing your mind about
 * something shouldn't leave it sitting in both lists.
 */
export function renderMemo(votes: Vote[]): string | null {
  const liked: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const vote of votes) {
    const title = vote.title?.trim().slice(0, MAX_TITLE);
    if (!title) continue;

    const dedupe = title.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const bucket = vote.verdict === "yes" ? liked : rejected;
    if (bucket.length < MEMO_PER_SIDE) bucket.push(title);
  }

  if (!liked.length && !rejected.length) return null;

  const lines = [
    "This person has already judged earlier recommendations. This is the only direct feedback you have about their taste, so weigh it above your own read of the photos where the two disagree.",
  ];
  if (liked.length) {
    lines.push("", "They said YES to:", ...liked.map((title) => `- ${title}`));
  }
  if (rejected.length) {
    lines.push("", "They said NO to:", ...rejected.map((title) => `- ${title}`));
  }
  lines.push(
    "",
    "Move toward what they kept and away from what they turned down. Look for the pattern behind the individual items — a rejected colour, cut, or category matters more than the specific listing that carried it."
  );

  return lines.join("\n");
}

/**
 * The memo for a browser, or null if there's nothing to say.
 *
 * Never throws. A taste memo is an enhancement, and a Redis hiccup must not take
 * down a run that would otherwise have worked.
 */
export async function tasteMemo(id: string | null): Promise<string | null> {
  if (!id || !redisConfigured()) return null;
  try {
    return renderMemo(await readVotes(id));
  } catch {
    return null;
  }
}
