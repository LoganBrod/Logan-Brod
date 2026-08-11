import { NextResponse } from "next/server";
import { readUser } from "@/lib/accounts";
import { sendDigest } from "@/lib/mail";
import { planFor } from "@/lib/plans";
import { recordSwept, sweepWatch } from "@/lib/sweep";
import { listWatchers, readWatches } from "@/lib/watches";
import { tasteIdFor } from "@/lib/viewer";
import type { Owner } from "@/lib/library";

export const dynamic = "force-dynamic";
// Several people's watches, each doing a search and a vision pass.
export const maxDuration = 300;

/**
 * How many people one invocation handles.
 *
 * The sweep is resumable by design — everything it did is recorded in the seen
 * sets, so the next run picks up whoever it didn't reach. That means this can
 * be a small number and stay inside any function timeout, rather than being a
 * single long job that fails wholesale near the end.
 */
const PEOPLE_PER_RUN = 25;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured this endpoint is closed rather than open: an
  // unauthenticated route that spends money on model calls is not something to
  // leave lying around because an env var wasn't set.
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * GET /api/cron/sweep — run everyone's standing searches.
 *
 * Called on a schedule (see vercel.json). Safe to call again at any time:
 * anything already reported is in the seen set and won't be reported twice.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const started = Date.now();
  const roster = await listWatchers();
  const summary = { people: 0, watches: 0, found: 0, emailed: 0, errors: [] as string[] };

  for (const owner of roster.slice(0, PEOPLE_PER_RUN)) {
    summary.people += 1;

    // Only accounts get email, because only accounts have an address. An
    // anonymous browser can hold watches; it just has to come and look.
    const user = owner.kind === "user" ? await readUser(owner.id).catch(() => null) : null;
    if (owner.kind === "user" && (!user || planFor(user) !== "member")) continue;

    const watches = await readWatches(owner);
    const tasteId = tasteIdFor(owner as Owner);

    for (const watch of watches) {
      if (watch.paused) continue;
      summary.watches += 1;

      const result = await sweepWatch(owner, watch, tasteId);
      if (result.error) {
        summary.errors.push(`${watch.name}: ${result.error}`);
        continue;
      }
      if (!result.found.length) {
        // Nothing worth sending, but everything looked at is still marked so
        // the next sweep doesn't pay to judge it again.
        await recordSwept(owner, watch, result.consideredKeys).catch(() => {});
        continue;
      }

      summary.found += result.found.length;

      try {
        if (user) {
          await sendDigest(user.email, watch.name, result.found);
          summary.emailed += 1;
        }
        // Marked only after the send. If email fails these stay unseen and get
        // offered again — being told twice is a nuisance, never being told is
        // the product silently not working.
        await recordSwept(owner, watch, result.consideredKeys);
      } catch (err) {
        summary.errors.push(
          `${watch.name}: ${err instanceof Error ? err.message : "send failed"}`
        );
      }
    }
  }

  return NextResponse.json(
    { ...summary, ms: Date.now() - started, rostered: roster.length },
    { headers: { "Cache-Control": "no-store" } }
  );
}
