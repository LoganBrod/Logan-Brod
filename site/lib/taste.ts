// What this browser has told us, explicitly and implicitly.
//
// Three kinds of memory live here, all under one long-lived id:
//
//   taste:{id}         the yes/no verdicts, as titles
//   taste:{id}:stats   counters per attribute, from every signal
//   taste:{id}:sizes   what fits, which is the one thing that can't be learned
//
// The verdicts are the loudest signal but the rarest — most people never press
// a button. The counters exist to learn from what people do instead: which
// pieces they open, which listings they actually click through to. Both get
// rendered into a memo that steers the query writing and the picking, so the
// app moves toward what works rather than repeating itself.
//
// Storage is the same optional Upstash instance as the closet. Without it there
// is no memory and no vote control, and everything else still works — the same
// posture as saving.

import { randomUUID } from "node:crypto";
import { getJson, redisConfigured, setJson } from "./redis";
import { cleanSizes, hasSizes, renderSizes, type Sizes } from "./sizing";
import { cleanPreferences, type Preferences } from "./preferences";

/** A year. Refreshed on every write, so an active browser never loses its taste. */
export const TASTE_TTL_SECONDS = 365 * 24 * 60 * 60;

export const TASTE_COOKIE = "taste_id";

export type Verdict = "yes" | "no";

/**
 * Everything a piece can tell us, weakest first.
 *
 * `shown` is the denominator and the reason the rest mean anything — a material
 * clicked twice is excellent if it appeared three times and dismal if it
 * appeared forty, and without impressions there's no way to tell those apart.
 */
export type Signal = "shown" | "opened" | "clicked" | "yes" | "no";

export const SIGNALS: Signal[] = ["shown", "opened", "clicked", "yes", "no"];

/** What the curation pass tagged a piece with. */
export interface ItemAttributes {
  category?: string;
  brand?: string;
  material?: string;
  colour?: string;
}

export interface Vote {
  /** The listing's title — what the model actually sees. */
  title: string;
  verdict: Verdict;
  at: string;
  source?: string;
  price?: number;
}

export interface TasteEvent {
  title: string;
  signal: Signal;
  attrs?: ItemAttributes;
  source?: string;
  price?: number;
}

export type Counter = Record<Signal, number>;
export type Stats = Record<string, Counter>;

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

/**
 * How many times an attribute has to have been shown before it is allowed to
 * say anything.
 *
 * One click on three impressions is not a 33% rate, it's noise, and acting on
 * it would let two unlucky early runs wall off a whole material. Five is low
 * enough to start learning inside a handful of closets and high enough that a
 * single accident can't drive the searches.
 */
const MIN_SHOWN = 5;

/** ~80% confidence. Higher and nothing clears the bar until far too late. */
const Z = 1.28;

/** How many attributes per facet reach the prompt, each way. */
const FACETS_PER_SIDE = 4;

/** Facets are bounded too — this is one value read and rewritten per action. */
const MAX_FACETS = 400;

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

/**
 * The cookie that carries the browser's identity.
 *
 * httpOnly: nothing in the page needs to read it, and it's the key to a record
 * of what someone likes.
 */
export function tasteCookie(id: string): string {
  return [
    `${TASTE_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TASTE_TTL_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
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

// ---------------------------------------------------------------- attributes

/** Attribute values arrive from a model, so they're normalised before use as keys. */
function normalizeValue(value: string | undefined): string | null {
  const clean = value?.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
  if (!clean || clean === "unknown" || clean === "n/a" || clean === "none") return null;
  return clean;
}

/**
 * The facets one piece counts towards.
 *
 * Brand is keyed within its category on purpose: a maker who is excellent at
 * waxed jackets has told you nothing about their boots, and merging the two
 * produces a brand preference that's really a category preference wearing a
 * disguise.
 */
export function facetsOf(attrs: ItemAttributes | undefined): string[] {
  if (!attrs) return [];

  const category = normalizeValue(attrs.category);
  const brand = normalizeValue(attrs.brand);
  const material = normalizeValue(attrs.material);
  const colour = normalizeValue(attrs.colour);

  const facets: string[] = [];
  if (category) facets.push(`category:${category}`);
  if (material) facets.push(`material:${material}`);
  if (colour) facets.push(`colour:${colour}`);
  if (brand) facets.push(`brand:${category ?? "any"}|${brand}`);
  return facets;
}

function emptyCounter(): Counter {
  return { shown: 0, opened: 0, clicked: 0, yes: 0, no: 0 };
}

export async function readStats(id: string): Promise<Stats> {
  if (!isValidTasteId(id)) return {};
  const stats = await getJson<Stats>(`${key(id)}:stats`);
  return stats && typeof stats === "object" ? stats : {};
}

/**
 * Fold a batch of events into the counters.
 *
 * Batched deliberately: a closet hangs eight pieces at once, and eight separate
 * read-modify-write round trips would both be slow and lose increments to each
 * other. One request per user action keeps the race window down to a person
 * clicking two things in the same instant, which costs a count, not correctness.
 */
export async function recordEvents(id: string, events: TasteEvent[]): Promise<void> {
  if (!isValidTasteId(id)) throw new Error("Invalid taste id.");
  if (!events.length) return;

  const stats = await readStats(id);

  for (const event of events) {
    if (!SIGNALS.includes(event.signal)) continue;
    for (const facet of facetsOf(event.attrs)) {
      const counter = stats[facet] ?? emptyCounter();
      counter[event.signal] += 1;
      stats[facet] = counter;
    }
  }

  // Keep the most-seen facets. A long tail of one-impression attributes can
  // never clear MIN_SHOWN anyway, so dropping it loses nothing.
  const trimmed: Stats =
    Object.keys(stats).length <= MAX_FACETS
      ? stats
      : Object.fromEntries(
          Object.entries(stats)
            .sort((a, b) => b[1].shown - a[1].shown)
            .slice(0, MAX_FACETS)
        );

  await setJson(`${key(id)}:stats`, trimmed, TASTE_TTL_SECONDS);
}

/**
 * Wilson score interval.
 *
 * A raw rate is unusable at these sample sizes — 1 of 2 and 40 of 80 are both
 * "50%", and only one of them means anything. The interval carries the sample
 * size with the estimate, so the bounds are what get compared: something is
 * genuinely good when even its pessimistic bound beats the average, and
 * genuinely bad when even its optimistic bound falls short.
 */
export function wilson(successes: number, trials: number): { lo: number; hi: number } {
  if (trials <= 0) return { lo: 0, hi: 1 };

  const p = Math.min(Math.max(successes / trials, 0), 1);
  const z2 = Z * Z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = Z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);

  return {
    lo: Math.max(0, (centre - margin) / denom),
    hi: Math.min(1, (centre + margin) / denom),
  };
}

/** Interest, weighted by how much each signal actually costs someone to give. */
function positives(counter: Counter): number {
  return Math.min(counter.shown, counter.clicked + counter.yes);
}

interface Scored {
  facet: string;
  kind: string;
  value: string;
  shown: number;
  hits: number;
  lo: number;
  hi: number;
}

function score(stats: Stats): Scored[] {
  const out: Scored[] = [];
  for (const [facet, counter] of Object.entries(stats)) {
    const split = facet.indexOf(":");
    if (split < 0) continue;
    const hits = positives(counter);
    const { lo, hi } = wilson(hits, counter.shown);
    out.push({
      facet,
      kind: facet.slice(0, split),
      value: facet.slice(split + 1),
      shown: counter.shown,
      hits,
      lo,
      hi,
    });
  }
  return out;
}

const FACET_COPY: Record<string, { works: string; doesnt: string }> = {
  material: { works: "Materials they go for", doesnt: "Materials they pass over" },
  colour: { works: "Colours they go for", doesnt: "Colours they pass over" },
  category: { works: "Garment types they engage with", doesnt: "Garment types they ignore" },
  brand: { works: "Makers that land, by category", doesnt: "Makers that don't land" },
};

/**
 * Render the counters into the part of the memo that describes patterns rather
 * than individual items.
 *
 * Everything is stated with its raw counts alongside, so the model can weigh a
 * 9-impression signal differently from a 40-impression one instead of taking
 * every line as equally settled.
 */
export function renderStats(stats: Stats): string | null {
  const scored = score(stats).filter((s) => s.shown >= MIN_SHOWN);
  if (!scored.length) return null;

  // Compared against this person's own average, not an absolute threshold. What
  // counts as a good click-through rate is entirely particular to one closet.
  const totalShown = scored.reduce((sum, s) => sum + s.shown, 0);
  const totalHits = scored.reduce((sum, s) => sum + s.hits, 0);
  const baseline = totalShown ? totalHits / totalShown : 0;

  const sections: string[] = [];

  for (const kind of ["material", "colour", "brand", "category"]) {
    const mine = scored.filter((s) => s.kind === kind);
    if (!mine.length) continue;

    const works = mine
      .filter((s) => s.lo > baseline)
      .sort((a, b) => b.lo - a.lo)
      .slice(0, FACETS_PER_SIDE);
    const doesnt = mine
      .filter((s) => s.hi < baseline)
      .sort((a, b) => a.hi - b.hi)
      .slice(0, FACETS_PER_SIDE);

    if (!works.length && !doesnt.length) continue;

    const copy = FACET_COPY[kind];
    const line = (s: Scored) => `${s.value.replace("|", " ")} (${s.hits} of ${s.shown})`;

    if (works.length) sections.push(`${copy.works}: ${works.map(line).join(", ")}.`);
    if (doesnt.length) sections.push(`${copy.doesnt}: ${doesnt.map(line).join(", ")}.`);
  }

  if (!sections.length) return null;

  /*
   * Framed as a tie-breaker, and framed hard.
   *
   * This block used to end "lean toward what earns their attention", which a
   * model quite reasonably read as a standing instruction about the person —
   * and it outvoted the photographs somebody had just uploaded. The reported
   * symptom was uploading a completely different look and getting last month's
   * back. It no longer goes to the analysis step at all, and here, where it is
   * still useful, it has to be explicit that the profile in front of it wins.
   */
  return [
    `The following is history, not instruction. It describes what this person engaged with in *previous* closets, which may have been built from a completely different set of clothes than the one you are judging against now.`,
    `The counts are pieces clicked through or approved, out of pieces shown. Their own average is ${(
      baseline * 100
    ).toFixed(0)}%, and only patterns clearly above or below it are listed.`,
    ...sections,
    "Use this only to choose between candidates that already suit the profile above — where two pieces are equally good matches, prefer the one closer to this history. Never use it to prefer a piece that fits this history over one that fits the profile. If the two disagree, the profile is right and this is out of date.",
  ].join("\n");
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

// --------------------------------------------------------------------- sizes

export async function readSizes(id: string): Promise<Sizes> {
  if (!isValidTasteId(id) || !redisConfigured()) return {};
  try {
    return cleanSizes(await getJson<Sizes>(`${key(id)}:sizes`));
  } catch {
    return {};
  }
}

export async function writeSizes(id: string, input: unknown): Promise<Sizes> {
  if (!isValidTasteId(id)) throw new Error("Invalid taste id.");
  const sizes = cleanSizes(input);
  await setJson(`${key(id)}:sizes`, sizes, TASTE_TTL_SECONDS);
  return sizes;
}

/**
 * The answers to the style questions, stored the same way sizes are.
 *
 * Kept server-side under the browser id so somebody is asked once rather than
 * on every visit — the same reasoning as sizes, minus the part about a wrong
 * value silently ruining every result. These are steering, not filtering (the
 * one exception is a ruled-out colour, which `lib/curate.ts` enforces).
 */
export async function readPreferences(id: string): Promise<Preferences> {
  if (!isValidTasteId(id) || !redisConfigured()) return {};
  try {
    return cleanPreferences(await getJson<Preferences>(`${key(id)}:prefs`));
  } catch {
    return {};
  }
}

export async function writePreferences(id: string, input: unknown): Promise<Preferences> {
  if (!isValidTasteId(id)) throw new Error("Invalid taste id.");
  const prefs = cleanPreferences(input);
  await setJson(`${key(id)}:prefs`, prefs, TASTE_TTL_SECONDS);
  return prefs;
}

// --------------------------------------------------------------- adoption

/**
 * Fold one browser's taste into another identity's.
 *
 * This runs when someone signs in, and what it protects is the work they did
 * before they had an account — the votes, the impressions, the sizes they
 * typed. Stranding all of that behind a cookie the moment they create an
 * account would punish exactly the people who liked the app enough to sign up.
 *
 * Counters are summed rather than replaced, because they're counts of things
 * that really happened on both sides. Sizes defer to whatever the account
 * already has: those were typed deliberately, and the newer statement of
 * intent is the one to trust.
 */
export async function adoptTaste(fromId: string, intoId: string): Promise<void> {
  if (!isValidTasteId(fromId) || !isValidTasteId(intoId) || fromId === intoId) return;
  if (!redisConfigured()) return;

  try {
    const [fromVotes, intoVotes, fromStats, intoStats, fromSizes, intoSizes] = await Promise.all([
      readVotes(fromId),
      readVotes(intoId),
      readStats(fromId),
      readStats(intoId),
      readSizes(fromId),
      readSizes(intoId),
    ]);

    // Newest first across both, deduped by title so a piece judged on each side
    // keeps only its most recent verdict.
    const votes = [...intoVotes, ...fromVotes]
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
      .filter(
        (vote, index, all) =>
          all.findIndex((other) => other.title?.toLowerCase() === vote.title?.toLowerCase()) ===
          index
      )
      .slice(0, MAX_STORED);

    const stats: Stats = { ...intoStats };
    for (const [facet, counter] of Object.entries(fromStats)) {
      const existing = stats[facet] ?? emptyCounter();
      for (const signal of SIGNALS) {
        existing[signal] += counter[signal] ?? 0;
      }
      stats[facet] = existing;
    }

    await Promise.all([
      setJson(key(intoId), votes, TASTE_TTL_SECONDS),
      setJson(`${key(intoId)}:stats`, stats, TASTE_TTL_SECONDS),
      hasSizes(intoSizes)
        ? Promise.resolve()
        : setJson(`${key(intoId)}:sizes`, fromSizes, TASTE_TTL_SECONDS),
    ]);
  } catch {
    // Signing in has to work even if the merge doesn't. Losing the anonymous
    // history is a disappointment; failing the sign-in is a broken product.
  }
}

// ---------------------------------------------------------------- the memo

/**
 * Everything known about a browser, as one block of prose for a prompt.
 *
 * Never throws. This is an enhancement, and a Redis hiccup must not take down a
 * run that would otherwise have worked — the app has to stay exactly as good as
 * it was before any of this existed.
 */
export async function tasteMemo(id: string | null): Promise<string | null> {
  if (!id || !redisConfigured()) return null;
  try {
    const [votes, stats, sizes] = await Promise.all([
      readVotes(id),
      readStats(id),
      readSizes(id),
    ]);

    const parts = [
      hasSizes(sizes) ? renderSizes(sizes) : null,
      renderStats(stats),
      renderMemo(votes),
    ].filter(Boolean);

    return parts.length ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}
