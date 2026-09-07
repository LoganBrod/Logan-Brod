// Fifty people using Clozet at once, with every third party imitated.
//
//   npx tsx scripts/load/run.mjs --users 50            # distinct addresses, 10s ramp
//   npx tsx scripts/load/run.mjs --users 50 --shared-ip # one office, one address
//   npx tsx scripts/load/run.mjs --users 5 --speed 0.1  # quick smoke
//
// Builds nothing: run `npm run build` first. Starts the fake Upstash (with a
// per-command delay standing in for the network), the fake upstream, and a
// production `next start` whose outbound fetches are redirected by
// scripts/load/intercept.mjs. Then each virtual user walks the product end to
// end - quiz answers, a full run, the second search when it fires, saving,
// voting, the saved list, the share page, accessories, colognes, calibration,
// the judge, a sizing lookup, a sign-in link - with its own cookie jar and its
// own address. Reports latency per step, every non-2xx, the server's memory,
// Redis command volume, model calls, and whether the per-query records and
// run summaries survived the concurrency.
//
// No key is real and no request leaves the machine.

import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { startFakeUpstash } from "../fake-upstash.mjs";
import { startFakeUpstream } from "./fake-upstream.mjs";
import { planBatches, rankAndCut } from "../../lib/batching.ts";
import { MIN_GOOD_PICKS } from "../../lib/requeryConst.ts";
import { slugOf } from "../../lib/yield.ts";

/** Every query the virtual users sent to the run's search, by slug, for the integrity check. */
const sentQueries = new Set();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const USERS = Number(arg("users", 50));
const SHARED_IP = process.argv.includes("--shared-ip");
const SPEED = Number(arg("speed", 1));
const RAMP_MS = Number(arg("ramp", 10)) * 1000;
const REDIS_MS = Number(arg("redis-ms", 3));
const PORT = Number(arg("port", 3123));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ADMIN = "sim-admin";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ------------------------------------------------------------- measurement
const samples = new Map(); // step -> [{ms, status}]
const failures = [];
function record(step, ms, status, detail) {
  if (!samples.has(step)) samples.set(step, []);
  samples.get(step).push({ ms, status });
  if (status < 200 || status >= 300) failures.push({ step, status, detail: String(detail ?? "").slice(0, 120) });
}
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

// ------------------------------------------------------------ virtual user
class User {
  constructor(n) {
    this.n = n;
    this.ip = SHARED_IP ? "203.0.113.10" : `10.${(n >> 8) & 255}.${n & 255}.7`;
    this.cookies = new Map();
    this.log = [];
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  keep(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  async call(step, path, init = {}) {
    const started = performance.now();
    let res, text;
    try {
      res = await fetch(ORIGIN + path, {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          cookie: this.cookieHeader(),
          "x-forwarded-for": this.ip,
          ...(init.headers ?? {}),
        },
      });
      this.keep(res);
      text = await res.text();
    } catch (err) {
      record(step, performance.now() - started, 0, err.message);
      return { ok: false, status: 0, json: null };
    }
    const ms = performance.now() - started;
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    record(step, ms, res.status, json?.error ?? (res.ok ? "" : text.slice(0, 80)));
    return { ok: res.ok, status: res.status, json, text };
  }
  post(step, path, body) {
    return this.call(step, path, { method: "POST", body: JSON.stringify(body) });
  }

  async walk() {
    const min = 30, max = 300;
    // Landing and the taste record that decides whether the quiz shows.
    await this.call("page /closet", "/closet");
    await this.call("GET /api/taste", "/api/taste");
    // The quiz: brands, then a budget band, then done.
    await this.post("POST /api/taste prefs", "/api/taste", { preferences: { brands: "Barbour, Uniqlo", onboarded: true } });
    await this.post("POST /api/taste prefs", "/api/taste", { preferences: { brands: "Barbour, Uniqlo", budget: { min, max }, onboarded: true } });
    // Sizes, so the fit lookup and the size filter have something to work with.
    await this.call("PUT /api/fit sizes", "/api/fit", { method: "PUT", body: JSON.stringify({ tops: "M", waist: 32, inseam: 32 }) });

    // The run.
    const runId = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
    const photos = [{ data: PNG, mediaType: "image/png" }, { data: PNG, mediaType: "image/png" }];
    const analysed = await this.post("POST /api/style/analyze", "/api/style/analyze", { photos, min, max, intent: "similar" });
    if (!analysed.ok) return;
    const profile = analysed.json.profile;

    const shopFor = async (queries, step) => {
      const params = new URLSearchParams({ min: String(min), max: String(max), runId });
      for (const q of queries) {
        params.append("q", q.query);
        sentQueries.add(slugOf(q.query));
      }
      const shopped = await this.call(step, `/api/style/shop?${params}`);
      return shopped.ok ? shopped.json.listings : [];
    };
    const curateAll = async (batches, step) => {
      const results = await Promise.all(
        batches.map((batch) => this.post(step, "/api/style/curate", { profile, candidates: batch, limit: 2, uploads: photos, intent: "similar", runId }))
      );
      return results.flatMap((r) => (r.ok ? r.json.items : []));
    };

    const candidates = await shopFor(profile.searchQueries, "GET /api/style/shop");
    if (!candidates.length) return;
    const batches = planBatches(candidates);
    let items = await curateAll(batches, "POST /api/style/curate");
    let requeried = false, added = 0;
    if (items.length < MIN_GOOD_PICKS) {
      requeried = true;
      const again = await this.post("POST /api/style/requery", "/api/style/requery", {
        profile,
        tried: profile.searchQueries.map((q) => ({ query: q.query, slot: q.category, found: 30, viewed: 16, picked: 0 })),
        min, max, notes: "Most of it was the wrong register.",
      });
      if (again.ok && again.json.searchQueries.length) {
        const second = await shopFor(again.json.searchQueries, "GET /api/style/shop (2nd)");
        const already = new Set(candidates.map((c) => c.id));
        const more = planBatches(second.filter((c) => !already.has(c.id)), { maxBatches: 3 });
        const before = items.length;
        items = [...items, ...(await curateAll(more, "POST /api/style/curate (2nd)"))];
        added = items.length - before;
      }
    }
    const ranked = rankAndCut(items);
    this.log.push({ picks: ranked.length, requeried, added });

    // Save, then the things a person does with a finished rail.
    const saved = await this.post("POST /api/closet", "/api/closet", {
      range: { min, max }, profile, items: ranked, notes: "sim",
      run: { runId, picks: ranked.length, requeried, addedByRequery: added, queries: profile.searchQueries.map((q) => ({ query: q.query, slot: q.category, found: 30, viewed: 16, picked: 1 })) },
    });
    const code = saved.ok ? saved.json.closet.code : null;
    if (ranked.length) {
      const first = ranked[0];
      await this.post("POST /api/taste events", "/api/taste", { events: ranked.slice(0, 4).map((it) => ({ title: it.title, signal: "shown", attrs: it.attrs, query: it.matchedQuery })) });
      await this.post("POST /api/taste vote", "/api/taste", { title: first.title, verdict: "yes", attrs: first.attrs, query: first.matchedQuery, price: first.price, source: first.source });
      await this.call("GET /api/image", `/api/image?url=${encodeURIComponent(first.imageUrl)}`);
    }
    await this.call("GET /api/closets", "/api/closets");
    if (code) await this.call("page /closet/[code]", `/closet/${code}`);

    // The small things, calibration, the judge, sizing, and a sign-in link.
    await Promise.all([
      this.post("POST /api/accessories", "/api/accessories", { kinds: ["belts"], min: 20, max: 150, code }),
      this.post("POST /api/colognes", "/api/colognes", { slot: "everyday", budget: "50-120", code }),
    ]);
    await this.call("GET /api/calibrate", "/api/calibrate");
    await this.post("POST /api/judge", "/api/judge", { url: "https://www.ebay.com/itm/1234567890", range: { min, max } });
    await this.post("POST /api/fit lookup", "/api/fit", { brand: "Uniqlo", category: "tops" });
    await this.post("POST /api/auth link", "/api/auth", { email: `person${this.n}@example.com` });
  }
}

// -------------------------------------------------------------- the servers
const upstash = await startFakeUpstash(0, { latencyMs: REDIS_MS });
const upstream = await startFakeUpstream(0, { speed: SPEED });

const env = {
  ...process.env,
  NODE_OPTIONS: `--import ${new URL("./intercept.mjs", import.meta.url).pathname}`,
  SIM_UPSTREAM: upstream.url,
  UPSTASH_REDIS_REST_URL: upstash.url,
  UPSTASH_REDIS_REST_TOKEN: "sim",
  ANTHROPIC_API_KEY: "sim-not-a-key",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com",
  EBAY_CLIENT_ID: "sim", EBAY_CLIENT_SECRET: "sim", EBAY_ENV: "production",
  SERPAPI_KEY: "sim",
  RESEND_API_KEY: "sim", MAIL_FROM: "Clozet <sim@example.com>",
  APP_ORIGIN: ORIGIN, CRON_SECRET: "sim-cron", ADMIN_SECRET: ADMIN,
  PORT: String(PORT),
};
const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = async () => {
  server.kill("SIGTERM");
  await Promise.all([upstash.close(), upstream.close()]);
};
process.on("SIGINT", async () => { await stop(); process.exit(1); });

for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${ORIGIN}/closet`);
    if (res.ok) break;
  } catch {}
  await sleep(500);
  if (i === 59) { console.error("server never became ready\n" + serverLog); await stop(); process.exit(1); }
}

// Memory of every next-server process, sampled once a second.
const rssSamples = [];
const sampler = setInterval(() => {
  try {
    const out = readFileSync("/proc/loadavg", "utf8").split(" ")[0];
    const ps = spawnSyncPs();
    rssSamples.push({ rssMb: ps, load: Number(out) });
  } catch {}
}, 1000);
function spawnSyncPs() {
  const out = execSync("ps -eo rss,comm | awk '$2 ~ /^next-server/ {s+=$1} END {print s+0}'", { encoding: "utf8" });
  return Math.round(Number(out) / 1024);
}

// ----------------------------------------------------------------- the run
console.log(`\n${USERS} users, ${SHARED_IP ? "one shared address" : "distinct addresses"}, ramp ${RAMP_MS / 1000}s, upstream speed ×${SPEED}, redis ${REDIS_MS}ms/command\n`);
const started = performance.now();
const users = Array.from({ length: USERS }, (_, i) => new User(i + 1));
await Promise.all(
  users.map(async (u, i) => {
    await sleep((RAMP_MS * i) / Math.max(1, USERS - 1));
    await u.walk();
  })
);
const wall = (performance.now() - started) / 1000;
clearInterval(sampler);

// --------------------------------------------------------------- integrity
const report = await fetch(`${ORIGIN}/api/report/queries`, { headers: { authorization: `Bearer ${ADMIN}` } }).then((r) => r.json()).catch(() => null);
await stop();

// ------------------------------------------------------------------ output
const ORDER = [...samples.keys()];
console.log("| step | calls | p50 ms | p95 ms | max ms | non-2xx |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const step of ORDER) {
  const rows = samples.get(step);
  const ms = rows.map((r) => r.ms);
  const bad = rows.filter((r) => r.status < 200 || r.status >= 300).length;
  console.log(`| ${step} | ${rows.length} | ${Math.round(pct(ms, 50))} | ${Math.round(pct(ms, 95))} | ${Math.round(Math.max(...ms))} | ${bad} |`);
}
const total = [...samples.values()].reduce((s, r) => s + r.length, 0);
console.log(`\n${total} requests in ${wall.toFixed(1)}s wall; ${failures.length} non-2xx.`);
if (failures.length) {
  const grouped = new Map();
  for (const f of failures) {
    const k = `${f.step} → ${f.status} ${f.detail}`;
    grouped.set(k, (grouped.get(k) ?? 0) + 1);
  }
  console.log("\nFailures:");
  for (const [k, n] of [...grouped].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
}

const picks = users.flatMap((u) => u.log);
const thin = picks.filter((p) => p.requeried);
console.log(`\nRuns finished: ${picks.length}/${USERS}. Second search fired on ${thin.length}; it added ${thin.reduce((s, p) => s + p.added, 0)} pieces across those. Rails: min ${Math.min(...picks.map((p) => p.picks))}, median ${pct(picks.map((p) => p.picks), 50)}, max ${Math.max(...picks.map((p) => p.picks))}.`);

const peak = Math.max(0, ...rssSamples.map((s) => s.rssMb));
const base = rssSamples[0]?.rssMb ?? 0;
console.log(`Server memory: ${base} MB at start, ${peak} MB peak. Load average peaked at ${Math.max(0, ...rssSamples.map((s) => s.load)).toFixed(2)}.`);

console.log(`\nRedis: ${upstash.stats.total} commands in ${upstash.stats.requests} round trips (${Math.round(upstash.stats.total / USERS)} commands, ${Math.round(upstash.stats.requests / USERS)} trips per user), ${upstash.store.size} keys.`);
console.log("  " + [...upstash.stats.byCommand].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  "));
console.log(`Model calls: ${[...upstream.stats.model].map(([k, v]) => `${k} ${v}`).join(", ")} (${Math.round([...upstream.stats.model.values()].reduce((a, b) => a + b, 0) / USERS)} per user).`);
console.log(`Upstream requests by host: ${[...upstream.stats.byHost].map(([k, v]) => `${k || "?"} ${v}`).join(", ")}.`);

if (report) {
  const recorded = new Set(report.queries.map((q) => slugOf(q.query)));
  const missing = [...sentQueries].filter((slug) => !recorded.has(slug)).length;
  console.log(`\nYield report: ${sentQueries.size} distinct run searches sent, ${sentQueries.size - missing} recorded (${missing} missing); ${report.runs.length} run summaries kept of ${picks.length} saved.`);
  const zero = report.queries.filter((q) => q.runs === 0).length;
  if (zero) console.log(`  ${zero} query records have runs=0 (signal arrived but the found-count write was lost or never made).`);
}

const errs = serverLog.split("\n").filter((l) => /error|warn|unhandled/i.test(l) && !/npm notice/.test(l));
if (errs.length) {
  console.log(`\nServer log lines with errors or warnings (${errs.length}):`);
  for (const l of [...new Set(errs)].slice(0, 15)) console.log("  " + l.trim().slice(0, 160));
}
process.exit(failures.length ? 2 : 0);
