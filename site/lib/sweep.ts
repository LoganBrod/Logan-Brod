// Running a watch, and deciding what's worth an email.
//
// The bar here is deliberately higher than a normal run's. A closet someone
// asked for can afford a merely-good piece; an unprompted email cannot. An
// alert that is wrong twice gets muted, and a muted alert is a cancelled
// subscription — so this reports nothing rather than something adequate.

import { curate } from "./curate";
import { dedupeKey, shop } from "./sources";
import { conflictsWithSizes, hasSizes } from "./sizing";
import { readSizes, tasteMemo } from "./taste";
import { markSeen, readSeen, updateWatch, type Watch } from "./watches";
import type { CuratedItem } from "./curate";
import type { StyleProfile } from "./schemas";
import type { Owner } from "./library";

/**
 * How good a piece has to be to interrupt someone.
 *
 * The curation pass scores 0-100 against the style profile. A normal run shows
 * whatever it picks; a sweep only forwards what it would defend loudly. Tuned
 * high on purpose — the failure mode that kills this feature is a boring email,
 * not a quiet week.
 */
const ALERT_SCORE = 82;

/** Pieces per email. Beyond a handful it stops reading as a find and starts reading as a feed. */
const MAX_PER_ALERT = 4;

/** One sweep looks at a smaller pool than a full run — it's checking, not searching. */
const SWEEP_CAP = 24;

export interface SweepResult {
  watch: Watch;
  found: CuratedItem[];
  /**
   * Everything this sweep looked at, not just what it forwarded. Marking only
   * the winners would mean re-judging — and re-paying for — the same rejected
   * listings on every sweep forever.
   */
  consideredKeys: string[];
  /** Set when the sweep couldn't run at all, as opposed to finding nothing. */
  error?: string;
}

/**
 * A profile good enough to judge against, without re-running the vision pass.
 *
 * The photos are long gone by the time a sweep runs — they were never stored —
 * so the watch's own queries stand in for the style. That's weaker than a real
 * profile, which is exactly why the taste memo matters more here than anywhere
 * else: it's the only thing carrying what the person actually responds to.
 */
function profileFor(watch: Watch): StyleProfile {
  return {
    summary: `Watching for: ${watch.queries.join("; ")}.`,
    aesthetics: [],
    palette: [],
    silhouette: "As implied by the searches themselves.",
    fabrics: [],
    formality: "As implied by the searches themselves.",
    gaps: watch.queries,
    searchQueries: [],
  };
}

/**
 * Run one watch and return what's worth sending.
 *
 * Never throws. A sweep runs unattended across many people; one bad watch must
 * not take the rest of the batch with it.
 */
export async function sweepWatch(
  owner: Owner,
  watch: Watch,
  tasteId: string | null
): Promise<SweepResult> {
  if (watch.paused || !watch.queries.length) return { watch, found: [], consideredKeys: [] };

  try {
    const [seen, sizes, memo] = await Promise.all([
      readSeen(owner, watch.id),
      tasteId ? readSizes(tasteId) : Promise.resolve({}),
      tasteId ? tasteMemo(tasteId) : Promise.resolve(null),
    ]);

    const seenSet = new Set(seen);
    const { listings } = await shop(watch.queries, watch.range, { cap: SWEEP_CAP });

    // Everything already reported, and anything that can't fit, before a single
    // photo is fetched — the expensive part should only ever see live candidates.
    const fresh = listings.filter((item) => {
      if (seenSet.has(dedupeKey(item))) return false;
      if (hasSizes(sizes) && conflictsWithSizes(item.title, sizes)) return false;
      return true;
    });

    if (!fresh.length) {
      await updateWatch(owner, watch.id, { lastSweptAt: new Date().toISOString() });
      return { watch, found: [], consideredKeys: [] };
    }

    const consideredKeys = fresh.map(dedupeKey);

    const curation = await curate(profileFor(watch), fresh, memo, MAX_PER_ALERT);
    const worth = curation.items.filter((item) => item.score >= ALERT_SCORE);

    await updateWatch(owner, watch.id, {
      lastSweptAt: new Date().toISOString(),
      found: watch.found + worth.length,
    });

    return { watch, found: worth.slice(0, MAX_PER_ALERT), consideredKeys };
  } catch (err) {
    return {
      watch,
      found: [],
      consideredKeys: [],
      error: err instanceof Error ? err.message : "Sweep failed.",
    };
  }
}

/**
 * Remember what was reported.
 *
 * Called only after the email is away. Everything the sweep *considered* is
 * marked, not just what was sent — otherwise the same rejected listings are
 * re-judged, and paid for, on every sweep forever.
 */
export async function recordSwept(
  owner: Owner,
  watch: Watch,
  consideredKeys: string[]
): Promise<void> {
  await markSeen(owner, watch.id, consideredKeys);
}
