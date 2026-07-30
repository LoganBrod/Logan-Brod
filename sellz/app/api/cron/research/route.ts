import { NextRequest } from "next/server";
import { POST as research } from "../../research/route";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * The nightly research sweep, under the name the other scheduled jobs use.
 *
 * /api/research has always accepted the cron secret and swept every tenant —
 * it predates the /api/cron/* convention because it is also the endpoint the
 * "Run research" button calls. Having the scheduled entry point live somewhere
 * other than the folder holding every other scheduled entry point is the sort
 * of thing that gets a job quietly left out when someone sets up the crons, so
 * this exposes it where it would be looked for.
 *
 * A delegation rather than a copy: one implementation, one set of auth and
 * quota checks, no chance of the two drifting.
 */
export async function POST(req: NextRequest) {
  return research(req);
}
