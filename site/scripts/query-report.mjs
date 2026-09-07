// Which searches turn into pieces people keep.
//
//   SITE_ORIGIN=https://www.levozlabs.com ADMIN_SECRET=… node scripts/query-report.mjs
//
// Pulls /api/report/queries and prints two tables: every query the app has
// run in the last ninety days, proven searches first, and the most recent
// runs with whether the second search fired. ADMIN_SECRET falls back to
// CRON_SECRET, matching the route. Add --json to get the raw report instead.

const origin = (process.env.SITE_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
if (!secret) {
  console.error("Set ADMIN_SECRET (or CRON_SECRET) to the deployment's value.");
  process.exit(1);
}

const res = await fetch(`${origin}/api/report/queries`, {
  headers: { authorization: `Bearer ${secret}` },
});
if (!res.ok) {
  console.error(`${origin}/api/report/queries answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const report = await res.json();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n) => `${Math.round(n * 100)}%`;
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

if (!report.queries.length) {
  console.log("No queries recorded yet. Run a closet and come back.");
} else {
  console.log("\n| query | runs | found | judged | kept | pick | shown | acted | keep | score |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const q of report.queries) {
    const acted = q.clicked + q.yes;
    console.log(
      `| ${cut(q.query, 48)} | ${q.runs} | ${q.found} | ${q.viewed} | ${q.picked} | ${pct(q.pickRate)} | ${q.shown} | ${acted} | ${q.shown >= 10 ? pct(q.keepRate) : "–"} | ${q.picked ? q.meanScore.toFixed(0) : "–"} |`
    );
  }
  console.log(
    "\npick = kept / judged (the judge's verdict on what the search found).\n" +
      "keep = (clicked + yes) / shown (a person's verdict); blank until ten pieces have been seen."
  );

  // The two lists that decide what to change next.
  const starved = report.queries.filter((q) => q.runs >= 2 && q.found === 0);
  const wrongRegister = report.queries.filter((q) => q.viewed >= 20 && q.pickRate < 0.05);
  if (starved.length) {
    console.log(`\nFound nothing, more than once (the words are wrong for how sellers title things):`);
    for (const q of starved) console.log(`  ${q.query}`);
  }
  if (wrongRegister.length) {
    console.log(`\nFound plenty, judge kept almost none (wrong register or cut):`);
    for (const q of wrongRegister) console.log(`  ${q.query}  (${q.viewed} judged, ${q.picked} kept)`);
  }
}

if (report.runs.length) {
  const requeried = report.runs.filter((r) => r.requeried);
  const thin = report.runs.filter((r) => r.picks < 6);
  console.log(`\nRuns: ${report.runs.length} kept. ${requeried.length} searched twice; ${thin.length} still ended under six pieces.`);
  console.log("\n| when | picks | second search | added | queries |");
  console.log("|---|---:|---|---:|---:|");
  for (const r of report.runs.slice(0, 20)) {
    console.log(
      `| ${r.at.slice(0, 16).replace("T", " ")} | ${r.picks} | ${r.requeried ? "yes" : "no"} | ${r.requeried ? r.addedByRequery : "–"} | ${r.queries.length} |`
    );
  }
}
console.log();
