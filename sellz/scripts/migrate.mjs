#!/usr/bin/env node
/**
 * Pre-deploy database step.
 *
 * Replaces `prisma db push`, which diffs the schema against the database and
 * guesses at the SQL. That guessing is what broke a deploy: adding a unique
 * constraint to a populated table is classified as potentially destructive, so
 * push refused, and the documented escape hatch (--accept-data-loss) would have
 * applied to every future deploy — including one that dropped a column of
 * customer data.
 *
 * Migrations are reviewed SQL, committed alongside the code that needs them.
 *
 * The wrinkle is that this database predates its migration history: it was
 * built by `db push`, so its tables exist but `_prisma_migrations` does not.
 * Running `migrate deploy` against it would try to create tables that are
 * already there and fail. The fix is to baseline — record the first migration
 * as already applied without running it — which Prisma documents as a manual
 * step.
 *
 * It is done automatically here instead, because a one-time manual step
 * against production is exactly the kind of thing that gets skipped, and the
 * symptom is a failed deploy at an inconvenient moment. The decision is made
 * from the database's actual state, not from a flag someone has to remember:
 *
 *   _prisma_migrations exists  -> history is intact, just deploy
 *   no history, but tables     -> pre-existing database, baseline then deploy
 *   no history, no tables      -> genuinely fresh, deploy builds it all
 *
 * Only the baseline is ever auto-resolved. Every later migration runs for real,
 * so this cannot silently skip a change.
 */

import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE = "00000000000000_baseline";

function run(args) {
  execFileSync("npx", ["prisma", ...args], { stdio: "inherit" });
}

async function main() {
  const prisma = new PrismaClient();

  let hasHistory = false;
  let hasTables = false;
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        to_regclass('public._prisma_migrations') IS NOT NULL AS has_history,
        to_regclass('public."User"')              IS NOT NULL AS has_tables
    `;
    hasHistory = rows[0]?.has_history === true;
    hasTables = rows[0]?.has_tables === true;
  } finally {
    await prisma.$disconnect();
  }

  if (!hasHistory && hasTables) {
    console.log(
      `[migrate] Existing database with no migration history — recording ${BASELINE} as applied.`
    );
    run(["migrate", "resolve", "--applied", BASELINE]);
  } else if (!hasHistory) {
    console.log("[migrate] Fresh database — every migration will run.");
  }

  run(["migrate", "deploy"]);
}

main().catch((err) => {
  console.error("[migrate] Failed:", err?.message ?? err);
  // Non-zero so the deploy stops here rather than starting an app whose
  // schema does not match its code.
  process.exit(1);
});
