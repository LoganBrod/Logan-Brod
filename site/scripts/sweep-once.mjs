// Run every standing search once, then exit.
//
// This exists for schedulers that run a container rather than send a request —
// Railway's cron being the one in use. It is the same call the GitHub Actions
// workflow makes, in a form that starts, finishes and gets out of the way.
//
//   SITE_ORIGIN=https://levozlabs.com CRON_SECRET=… node scripts/sweep-once.mjs
//
// Exit codes matter here: a scheduler decides whether a run failed by reading
// them, so a sweep that 401s has to exit non-zero rather than print and shrug.

const origin = (process.env.SITE_ORIGIN ?? "").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!origin) {
  console.error("SITE_ORIGIN is not set — nothing to sweep.");
  process.exit(1);
}
if (!secret) {
  console.error("CRON_SECRET is not set — /api/cron/sweep refuses every request without it.");
  process.exit(1);
}

const url = `${origin}/api/cron/sweep`;

/** A wrong secret is never worth retrying; a 502 from a container still booting is. */
const ATTEMPTS = 3;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      // Long, because a sweep is several people's searches and a vision pass each.
      signal: AbortSignal.timeout(300_000),
    });
    const body = await res.text();

    if (res.ok) {
      console.log(`sweep ok — ${body.slice(0, 500)}`);
      process.exit(0);
    }

    if (res.status === 401) {
      console.error("sweep refused (401): CRON_SECRET here does not match the one the app has.");
      process.exit(1);
    }

    console.error(`sweep failed (${res.status}) on attempt ${attempt}: ${body.slice(0, 300)}`);
  } catch (error) {
    console.error(`sweep errored on attempt ${attempt}: ${error instanceof Error ? error.message : error}`);
  }

  if (attempt < ATTEMPTS) {
    const wait = 2 ** attempt * 1000;
    console.error(`retrying in ${wait / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

console.error(`sweep did not succeed after ${ATTEMPTS} attempts.`);
process.exit(1);
