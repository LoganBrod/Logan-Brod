import { randomInt } from "node:crypto";
import { claimKey, expire, getJson, setJson } from "./redis";
import type { Outfit, StyleProfile } from "./schemas";
import type { CuratedItem } from "./curate";
import type { PriceRange } from "./sources/types";

/** Ninety days, refreshed every time a closet is opened. */
export const CLOSET_TTL_SECONDS = 90 * 24 * 60 * 60;

export const CLOSET_COOKIE = "closet_code";

// No 0/O/1/I/L — these get read aloud and typed in by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/**
 * Everything a run produces. This exists the moment curation returns, whether
 * or not it was ever stored — which is why it's separate from `Closet`. Saving
 * is optional, so the UI must be able to render results that have no code.
 */
export interface ClosetContents {
  range: PriceRange;
  profile: StyleProfile;
  items: CuratedItem[];
  outfits: Outfit[];
  notes?: string;
}

/** Contents that made it into Redis, and therefore have an identity. */
export interface Closet extends ClosetContents {
  code: string;
  createdAt: string;
  updatedAt: string;
}

export type ClosetDraft = ClosetContents;

function key(code: string): string {
  return `closet:${code}`;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  return (
    code.length === CODE_LENGTH &&
    [...code].every((char) => ALPHABET.includes(char))
  );
}

function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Write a new closet under a fresh code.
 *
 * Uses SET NX so a collision loses the race instead of overwriting someone
 * else's closet; with 31^6 (~887M) codes a retry is already vanishingly rare,
 * and five attempts makes it a non-event.
 */
export async function createCloset(draft: ClosetDraft): Promise<Closet> {
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const closet: Closet = { ...draft, code, createdAt: now, updatedAt: now };
    if (await claimKey(key(code), closet, CLOSET_TTL_SECONDS)) {
      return closet;
    }
  }

  throw new Error("Could not allocate a closet code. Please try again.");
}

/** Reading a closet renews it, so an in-use closet never expires out from under someone. */
export async function readCloset(code: string): Promise<Closet | null> {
  if (!isValidCode(code)) return null;

  const closet = await getJson<Closet>(key(code));
  if (!closet) return null;

  await expire(key(code), CLOSET_TTL_SECONDS).catch(() => {
    // A failed TTL refresh is not worth failing the read over.
  });
  return closet;
}

export async function updateCloset(
  code: string,
  draft: ClosetDraft
): Promise<Closet | null> {
  const existing = await readCloset(code);
  if (!existing) return null;

  const updated: Closet = {
    ...draft,
    code: existing.code,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await setJson(key(code), updated, CLOSET_TTL_SECONDS);
  return updated;
}
