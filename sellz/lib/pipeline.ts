import {
  getPlaybook,
  listListings,
  setPlaybook,
  updateListing,
  type Listing,
} from "./store";
import { analyzePerformance, diagnose, researchComps, scoreListing } from "./brain";
import { syncEbayListings } from "./ebaySync";
import { checkUsage, incrementUsage } from "./usage";

/**
 * The scheduled maintenance pipeline.
 *
 * Everything here was previously a button the seller had to remember to press
 * — sync, score, comps, diagnose, re-analyze. A listing only benefits from
 * those if they actually happen, and the ones that need them most belong to
 * the sellers least likely to be clicking around an admin screen.
 *
 * Three rules hold throughout:
 *
 * 1. Each pass is independently guarded and independently caught. A tenant
 *    whose eBay token expired must not stop the diagnosis pass for everyone
 *    after them in the loop.
 *
 * 2. Work is capped per run, not per day. Caps keep one large account from
 *    eating the whole function timeout; whatever is missed is picked up on the
 *    next run a few hours later, because every pass selects by "still missing"
 *    rather than by a cursor.
 *
 * 3. Nothing here changes a live listing. These passes read, score, and write
 *    to our own store. Applying changes to eBay stays with the research sweep,
 *    which is gated on the seller's automation settings.
 */

/** Ceilings per tenant per run. */
const LIMITS = {
  score: 10,
  comps: 6,
  diagnose: 5,
};

/** How long a listing sits unsold before it's worth asking why. */
const STALE_DAYS = 14;

/** Sales since the last playbook that justify re-analyzing. */
const SALES_PER_REANALYSIS = 3;

export interface PipelineResult {
  userId: string;
  synced?: { created: number; updated: number };
  scored: number;
  comped: number;
  diagnosed: number;
  playbook: boolean;
  /** Live listings moved to "stale" this run. Set by the caller. */
  staled?: number;
  errors: string[];
}

function daysLive(l: Listing): number | null {
  const start = l.outcome?.listedAt ?? l.publishedAt ?? l.createdAt;
  const t = Date.parse(start);
  if (!isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

/**
 * Run the maintenance passes for one seller.
 *
 * `budgetMs` is a wall-clock deadline for this tenant's share of the run, so
 * one seller with hundreds of listings cannot starve the ones after them.
 */
export async function runPipelineForUser(
  userId: string,
  budgetMs = 120_000
): Promise<PipelineResult> {
  const deadline = Date.now() + budgetMs;
  const result: PipelineResult = {
    userId,
    scored: 0,
    comped: 0,
    diagnosed: 0,
    playbook: false,
    errors: [],
  };
  const outOfTime = () => Date.now() > deadline;

  // --- 1. Sync from eBay -------------------------------------------------
  // First, because everything below reads the listings it reconciles, and
  // because this is what turns an eBay sale into a local "sold" row.
  try {
    const sync = await syncEbayListings(userId);
    result.synced = { created: sync.created, updated: sync.updated };
  } catch (err) {
    // An expired token is the common case here and it invalidates the eBay
    // passes but not the local ones, so carry on rather than returning.
    result.errors.push(`sync: ${err instanceof Error ? err.message : "failed"}`);
  }

  const listings = await listListings(userId);

  // --- 2. Score anything unscored ----------------------------------------
  // Cheap relative to the others and the input to everything else — the fix
  // panel and auto-publish both read brainScore — so it runs first and with
  // the highest cap.
  const unscored = listings
    .filter((l) => l.status === "active" || l.status === "draft")
    .filter((l) => !l.brainScore)
    .slice(0, LIMITS.score);

  // Not metered, because the manual "Score" button isn't either. Metering the
  // automatic path more strictly than the button would mean automation
  // silently doing less than the seller could do by hand.
  for (const l of unscored) {
    if (outOfTime()) break;
    try {
      await scoreListing(userId, l.id);
      result.scored++;
    } catch (err) {
      result.errors.push(`score ${l.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // --- 3. Comps for anything without them --------------------------------
  // Only for live listings: comps on a draft go stale before it's posted, and
  // this is the most expensive pass per item.
  const uncomped = listings
    .filter((l) => l.status === "active" && !l.comps?.summary)
    .slice(0, LIMITS.comps);

  for (const l of uncomped) {
    if (outOfTime()) break;
    if (!(await checkUsage(userId, "research")).allowed) break;
    try {
      await researchComps(userId, l.id);
      await incrementUsage(userId, "research");
      result.comped++;
    } catch (err) {
      result.errors.push(`comps ${l.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // --- 4. Diagnose the stale ---------------------------------------------
  // A listing up 14+ days without selling has told us something. Re-diagnosing
  // one that was already diagnosed since it last went stale just burns quota,
  // so skip anything with a diagnosis newer than the staleness threshold.
  const stale = listings
    .filter((l) => l.status === "active")
    .filter((l) => (daysLive(l) ?? 0) >= STALE_DAYS)
    .filter((l) => {
      if (!l.diagnosis?.at) return true;
      const age = Date.now() - Date.parse(l.diagnosis.at);
      return !isFinite(age) || age > STALE_DAYS * 86_400_000;
    })
    .slice(0, LIMITS.diagnose);

  // Unmetered for the same reason as scoring above.
  for (const l of stale) {
    if (outOfTime()) break;
    try {
      await diagnose(userId, l.id);
      result.diagnosed++;
    } catch (err) {
      result.errors.push(`diagnose ${l.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // --- 5. Re-analyze the playbook every few sales ------------------------
  // Counted against the existing playbook's timestamp rather than a stored
  // counter, so this stays correct if a sale is backfilled or a playbook is
  // regenerated by hand.
  try {
    const playbook = await getPlaybook(userId);
    const since = playbook ? Date.parse(playbook.updatedAt) : 0;
    const salesSince = listings.filter((l) => {
      if (l.status !== "sold" || !l.outcome?.soldAt) return false;
      const t = Date.parse(l.outcome.soldAt);
      return isFinite(t) && t > since;
    }).length;

    if (salesSince >= SALES_PER_REANALYSIS && !outOfTime()) {
      const fresh = await analyzePerformance(userId);
      await setPlaybook(userId, fresh);
      result.playbook = true;
    }
  } catch (err) {
    // analyzePerformance throws when there isn't enough data yet, which is a
    // normal state for a new seller rather than a failure worth reporting.
    const msg = err instanceof Error ? err.message : "failed";
    if (!/Need either/.test(msg)) result.errors.push(`playbook: ${msg}`);
  }

  return result;
}

/**
 * Mark listings that have gone quiet as stale, so the UI and the research
 * sweep can treat them differently from healthy live ones.
 *
 * Local bookkeeping rather than an eBay call, so it runs even for a tenant
 * whose token has expired.
 */
export async function markStale(userId: string): Promise<number> {
  const listings = await listListings(userId);
  let marked = 0;
  for (const l of listings) {
    if (l.status !== "active") continue;
    if ((daysLive(l) ?? 0) < STALE_DAYS) continue;
    // Something with watchers is working slowly, not dead — leave it active
    // so it isn't swept into the "fix these" pile.
    if ((l.outcome?.watchers ?? 0) > 0) continue;
    await updateListing(userId, l.id, { status: "stale" });
    marked++;
  }
  return marked;
}
