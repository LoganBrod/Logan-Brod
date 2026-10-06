// A switch that stops the app spending money, without taking it down.
//
// Set PAUSED=1 on the deployment. Every route that can reach a model returns a
// short, honest 503 before it parses a body, checks a cookie or buys a token,
// and the closet page offers a notice instead of the form so nobody uploads
// four photos and waits forty seconds to be told no.
//
// Deliberately an environment variable rather than a constant in the source:
// the point of a pause is that it can be flipped and un-flipped in seconds from
// the Railway dashboard, without a deploy, at the moment somebody notices the
// bill. A constant here would need a commit, a build and a restart, which is
// exactly the wrong shape for an emergency brake.
//
// What is NOT paused:
//
//   /api/image     Saved closets still have to render. It fetches pictures,
//                  which costs bandwidth and no model tokens.
//   /api/closet    Reading back what somebody already saved is free.
//
// What is paused but answers 200 rather than 503:
//
//   /api/cron/sweep  The GitHub Action treats anything but a 200 as a failure
//                    and exits 1, so a 503 here would turn the twice-daily
//                    sweep red for as long as the pause lasts. It answers 200
//                    with `paused: true` and does no work.

import { NextResponse } from "next/server";
import { PAUSED_MESSAGE } from "./copy";

// Re-exported so server code has one import for the whole pause, while the
// sentence itself stays in copy.ts where a client component can reach it.
export { PAUSED_MESSAGE };

/** True when the deployment has been told to stop spending. */
export function generationsPaused(): boolean {
  return process.env.PAUSED === "1";
}

/**
 * The answer every paused spending route gives.
 *
 * 503 rather than 403: this is the service declining to work right now, not the
 * caller lacking permission. `Retry-After` is deliberately absent, because
 * nobody knows when, and a made-up number would send well-behaved clients back
 * on a schedule for no reason.
 */
export function pausedResponse(): NextResponse {
  return NextResponse.json(
    { error: PAUSED_MESSAGE, paused: true },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
