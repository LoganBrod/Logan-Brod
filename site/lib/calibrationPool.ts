// The deck everybody swipes, built once for everybody.
//
// The quiz opens on fifteen real garments, and building that deck meant
// fifteen marketplace searches while somebody watched a spinner. On a cold
// process that was the better part of a minute, before the app had shown them
// anything work at all - the worst possible place to spend it, since this is
// the first screen and it is not optional.
//
// The probes are fixed and the price band is fixed, so the pool is the same
// for every visitor. Only what happens after it is personal: sizes filter it,
// and the seen set removes what this person has already been asked about. So
// the searches are done once and shared, and a visitor pays a Redis read.
//
// Stale is served while fresh is fetched. A pool older than six hours still
// answers the request; the refresh happens behind it and lands for the next
// person. Nobody waits for a rebuild except the very first visitor after a
// whole day of silence, and the sweep warms it twice daily so that in
// practice nobody does.

import { CALIBRATION_PROBES } from "./calibration";
import { getJson, redisConfigured, setJson } from "./redis";
import { shop } from "./sources";
import type { ProductListing } from "./sources/types";

const KEY = "calibrate:pool:v1";

/*
 * A fixed deck that refreshes itself, rather than a live search.
 *
 * Nothing about this quiz wants live stock. It asks whether somebody would
 * wear a thing, and the answer does not change because the listing sold - so
 * the pool is rebuilt about weekly and served from cache in between, and the
 * sweep refreshes it twice a day so the refresh never lands on a visitor.
 * Fifteen searches a week, and no visitor ever waiting on one.
 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Past this it is gone and somebody would have to wait. The sweep gets there first. */
const TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Depth, so the deck survives being sifted.
 *
 * Fifteen cards come out of this, and everything the asker has already been
 * shown is removed first - a pool of exactly fifteen would hand a returning
 * visitor an empty deck. Four per probe is enough for several passes and
 * still one round trip per probe.
 */
const PER_PROBE_DEPTH = 4;
const MAX_POOL = 60;

interface Pool {
  builtAt: string;
  listings: ProductListing[];
}

/**
 * One build at a time per process.
 *
 * Without this, ten people arriving at once on a cold instance run ten
 * identical fan-outs of fifteen searches - which is both the slowest way to
 * do it and the fastest way to be rate-limited by eBay.
 */
let inFlight: Promise<ProductListing[]> | null = null;

async function build(): Promise<ProductListing[]> {
  const found = await shop(
    CALIBRATION_PROBES.map((probe) => probe.query),
    // Wide on purpose. This asks whether you like the look of something, not
    // whether you would buy it; a narrow band turns a taste question into a
    // budget one.
    { min: 20, max: 400 },
    { perQueryLimit: PER_PROBE_DEPTH, cap: MAX_POOL }
  );

  // A card with no photograph is not a question anybody can answer.
  const listings = found.listings.filter((item) => item.imageUrl).slice(0, MAX_POOL);

  if (listings.length && redisConfigured()) {
    const pool: Pool = { builtAt: new Date().toISOString(), listings };
    await setJson(KEY, pool, TTL_SECONDS).catch(() => {
      // A pool that cannot be cached is still a pool. The next visitor pays
      // for the searches again, which is the old behaviour, not a failure.
    });
  }
  return listings;
}

function buildOnce(): Promise<ProductListing[]> {
  if (!inFlight) {
    inFlight = build().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** The shared pool: cached, refreshed behind the reader, built only if it must be. */
export async function calibrationPool(): Promise<ProductListing[]> {
  if (!redisConfigured()) return buildOnce();

  const cached = await getJson<Pool>(KEY).catch(() => null);
  if (cached?.listings?.length) {
    const age = Date.now() - Date.parse(cached.builtAt);
    if (!Number.isFinite(age) || age > FRESH_MS) {
      // Behind the response, not in front of it.
      void buildOnce().catch(() => {});
    }
    return cached.listings;
  }

  return buildOnce();
}

/** Rebuild now, so nobody has to wait for it later. Called by the sweep. */
export async function warmCalibrationPool(): Promise<number> {
  const listings = await buildOnce();
  return listings.length;
}
