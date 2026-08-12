# Cost audit

**Audited 2026-08-12** against commit `434a77e`, branch `claude/mens-style-recommendation-app-hlh3n9`.

## Method, and what this audit could not do

| Label | Meaning |
|---|---|
| **measured** | Read out of the code or config, or executed. Cited to `file:line`. |
| **estimated** | Computed from measured inputs plus a stated assumption. The assumption is always given. |
| **UNKNOWN** | Could not be determined. Says what to check and why it couldn't be. |

Two limits shaped this audit, both worth stating plainly:

1. **There is no `ANTHROPIC_API_KEY`, eBay credential, or SerpAPI key in the audit environment.** So no operation could be run end to end, no token count is measured, and no cross-check against the Anthropic console was possible. Every dollar figure below is **estimated**. Instrumentation to replace them with measurements is built and committed — see [Replacing the estimates](#replacing-the-estimates).
2. **The network egress proxy blocks every third-party pricing domain** (`vercel.com`, `upstash.com`, `serpapi.com` all returned `EGRESS_BLOCKED`). Only `platform.claude.com` was reachable. Every third-party price is therefore UNKNOWN rather than quoted from memory.

---

## What you are losing

**Today: approximately nothing.** No production traffic, all infrastructure on free tiers, no payment collection built. The exposure is forward-looking.

Three ways money leaves, worst first.

### 1. The two most expensive endpoints have no quota check at all — measured

`POST /api/style/analyze` and `POST /api/style/curate` are the four model calls that make up a closet run. Neither checks a plan, a meter, or a rate limit. `readViewer` is called in both, but only to read the taste memo and sizes — never to authorise.

- `app/api/style/analyze/route.ts:78` — `readViewer` used for sizes only
- `app/api/style/curate/route.ts:53` — `readViewer` used for the memo only
- No `middleware.ts` exists. The only rate limit anywhere in the app is on sign-in link requests (`lib/accounts.ts:201`)

The `closets` meter is checked and spent in `POST /api/closet` — the **save** step, at `app/api/closet/route.ts:148` and `:173`, which runs *after* all four model calls have completed and been billed.

**Consequences, in order of severity:**

- **These endpoints are unauthenticated and uncapped.** Anyone who reads the network tab can POST to them in a loop. Each loop costs an estimated **$0.36** of your Anthropic balance. The only ceiling is your own Anthropic rate limit. This is the single largest financial risk in the codebase and it is not theoretical — the routes require no cookie, no session, and no origin check.
- **A free user who hits their monthly limit still costs you a full run.** They get a 402 on save, after you have paid for the analysis and all three curation calls.
- **Every meter is bypassable by sending no cookie.** `allowance(null, …)` returns `used: 0` and therefore `allowed: true` (`lib/plans.ts:110,133`), and `spend(null, …)` returns early without counting (`lib/plans.ts:144`). This affects judgements and fit lookups too, both of which *do* check quota — the check just passes for a cookieless caller.
- **Clearing cookies resets the quota** even for callers who do send one, since anonymous identity is a browser cookie (`lib/viewer.ts`).

### 2. Members cost more than any plausible subscription — estimated

No payment collection exists (`grantPlan` in `lib/plans.ts:83` is the entire billing surface; `MEMBER_EMAILS` is the stopgap). Every member today is free to them and costs you money.

A member at the enforced cap of 10 standing scans, swept twice daily, is an estimated **$40/month** in model spend. Detail in [Cost per user per month](#cost-per-user-per-month).

### 3. Free-tier abuse is cheap but uncapped in aggregate — estimated

A free user who plays entirely by the rules costs at most **$0.51/month** (1 closet + 3 judgements). That is fine. What is not bounded is the number of free users, since anonymous use requires no signup.

---

## 1. Services we pay for, or will

Sources: `site/package.json`, `site/.env.local.example`, `.github/workflows/sweep.yml`, and every `process.env.*` and outbound host in `site/lib` and `site/app` (**measured**).

| Service | What we use it for | Current plan | Cost | Next tier | What forces the upgrade |
|---|---|---|---|---|---|
| **Anthropic** | Every model call — 6 call sites | Pay-as-you-go, no tier | $5/MTok in, $25/MTok out (Opus 5) | n/a — usage-based | n/a. Rate limits scale by spend tier |
| **eBay Browse API** | Primary product search | UNKNOWN — `EBAY_ENV` defaults to `production` (`.env.local.example:13`) | UNKNOWN | UNKNOWN | UNKNOWN — need to check developer.ebay.com for the Browse API call ceiling |
| **SerpAPI** | Google Shopping + brand-fit web search | UNKNOWN — key presence is the only signal in code | UNKNOWN | UNKNOWN | UNKNOWN — need to check serpapi.com/pricing |
| **Upstash Redis** | Closets, accounts, taste, watches, meters | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — need to check upstash.com/pricing |
| **Vercel** | Hosting, serverless functions | **Hobby** — observed in the dashboard sidebar badge | $0 | Pro | UNKNOWN. Known Hobby limits that already bind: 60s function cap, cron frequency |
| **Resend** | Sign-in links + scan digests | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — need to check resend.com/pricing |
| **GitHub Actions** | The twice-daily sweep (`.github/workflows/sweep.yml`) | Free tier for public repos | $0 | n/a | Private repos consume the 2,000 min/month allowance; this workflow uses ~1 min/run × 60 runs/month |
| **Domain** (`levozlabs.com`) | UNKNOWN registrar | UNKNOWN | UNKNOWN | — | — |
| **Stripe / PayPal** | **Not integrated.** No payment code exists | — | — | — | — |
| **Analytics** | **None.** No analytics package in `package.json` | — | — | — | — |
| **Image hosting** | **None needed.** Photos are downscaled in-browser and sent inline; nothing is stored | $0 | — | — | — |

**Every UNKNOWN above is blocked by the egress proxy, not by lack of effort.** `WebFetch` on `vercel.com`, `upstash.com`, and `serpapi.com` all returned `EGRESS_BLOCKED`. Anthropic's pricing was reachable and is quoted from <https://platform.claude.com/docs/en/about-claude/pricing> (checked 2026-08-12).

**Commercial-use / affiliate / subscription permissions: UNKNOWN for every service.** I could not reach a single terms page. This is the section to fill in by hand before taking money.

### Anthropic pricing — measured

From the pricing page, 2026-08-12:

| Model | Input | Output | 5m cache write | Cache read |
|---|---:|---:|---:|---:|
| Claude Opus 5 (what we use) | $5 / MTok | $25 / MTok | $6.25 / MTok | $0.50 / MTok |
| Claude Sonnet 5 | $2 / MTok | $10 / MTok | $2.50 / MTok | $0.20 / MTok |
| Claude Haiku 4.5 | $1 / MTok | $5 / MTok | $1.25 / MTok | $0.10 / MTok |

---

## 2. Every model call — measured

| Call site | Operation | Model | Effort | `max_tokens` | Images sent |
|---|---|---|---|---:|---|
| `lib/analyze.ts:37` | Read style off uploads | `claude-opus-5` | **high** | 8,000 | up to 6 uploads |
| `lib/curate.ts:88` | Pick garments from candidates | `claude-opus-5` | medium | 8,000 | 16 product photos |
| `lib/judge.ts:56` | "Is this any good?" | `claude-opus-5` | medium | 4,000 | 1 |
| `lib/fit.ts:123` | Brand size recommendation | `claude-opus-5` | **high** | 6,000 | 0 (scraped text) |
| `lib/wardrobeOwned.ts:72` | Read owned garments off photos | `claude-opus-5` | medium | 8,000 | up to 6 uploads |
| `lib/wardrobeOwned.ts:145` | Build outfits | `claude-opus-5` | medium | 8,000 | 0 |

`MODEL` is a single constant (`lib/anthropic.ts:13`). **Every call in the app uses Opus 5.** There is no cheaper model anywhere in the pipeline.

### Estimated cost per operation

**Assumption, and it is the whole uncertainty:** thinking is billed as output, and how much the model thinks cannot be read off the source. The table below assumes thinking consumes **35% of each call's `max_tokens`** ("likely"). The calculator at `site/scripts/cost-model.mjs` prints 15% / 35% / 70% side by side.

Image tokens use Claude's `(width × height) / 750` rule with **measured** dimensions.

#### One closet search — estimated

| Step | Model | Calls | Input | Output | Images | Dimensions | Cost |
|---|---|---:|---:|---:|---:|---|---:|
| analyze | opus-5 | 1 | 7,881 | 3,700 | 3 | 1568×1176 | $0.1319 |
| curate | opus-5 | 3 | 14,802 | 6,240 | 48 | 400×400 | $0.2300 |
| shop | — | 0 | — | — | — | — | $0 (eBay + SerpAPI only) |
| **total** | | **4** | **22,683** | **9,940** | **51** | | **$0.3619** |

Range across thinking assumptions: **$0.25 – $0.56**.

#### Everything else — estimated

| Operation | Calls | Cost | Note |
|---|---:|---:|---|
| One standing-scan sweep (6 fresh listings) | 1 | $0.0647 | |
| One standing-scan sweep (24 fresh, worst case) | 1 | $0.0863 | |
| One standing-scan sweep (0 fresh) | 0 | **$0** | Returns before the model call — `lib/sweep.ts:107` |
| One judgement | 1 | $0.0502 | |
| One brand-fit lookup | 1 | $0.0915 | Plus 1 SerpAPI search |
| One wardrobe outfit build | 2 | ~$0.18 | read + outfits, both `max_tokens` 8,000 |
| **One share-card render** | **0** | **$0** | Pure client-side canvas (`app/components/ShareCard.tsx`) plus the `/api/image` byte proxy. No model call. |

A sweep that judges 2 listings costs nearly as much as one judging 24, because output dominates. **Lowering `SWEEP_CAP` would save almost nothing.**

#### Cross-check against the Anthropic console

**Not performed.** No API key, no console access, and no requests were made during this audit. Run the instrumentation below and compare against the console's usage view for the same window.

---

## 3. The specific questions

### What pixel dimensions are product images when they reach the model? Are we resizing?

**Measured. Yes, both paths are bounded — and this is already the single best cost decision in the codebase.**

| Path | Where | Result | Tokens each |
|---|---|---|---:|
| User uploads | `lib/image.ts:9` — `MAX_EDGE = 1568`, downscaled in-browser to JPEG before upload | ≤1568 on the long edge | ~2,459 |
| eBay product photos | `lib/sources/menswear.ts:110` — URL rewritten `/s-l\d+/` → `/s-l400/` before fetching | ≤400 on the long edge | ~213 |
| SerpAPI product photos | `lib/sources/serpapi.ts` — uses `raw.thumbnail` as served | UNKNOWN — depends on Google's CDN. The instrumentation logs this. |

At 400px, sixteen product photos cost about 3,400 tokens total. Un-rewritten eBay images run to 1600px, which would be ~3,400 tokens **each** — a 16× increase on the input side of every curate call. That one `.replace()` is worth more than any pricing decision.

### Which model runs each step?

**Measured** — see the table in §2. All six call sites use `claude-opus-5` via a single `MODEL` constant.

### Are we prompt-caching anything? What's the hit rate?

**Measured: no.** `grep -rn "cache_control" lib app` returns nothing. Hit rate is therefore **0%**, and `cache_creation_input_tokens` / `cache_read_input_tokens` are null on every response.

**Adding it would not help much, and it's worth saying why.** The cacheable prefix is the system prompt plus the style profile and taste memo — about 1,100 tokens for curate. Opus 5's minimum cacheable prefix is 512 tokens, so it would just qualify. But the three curate calls run **in parallel** (`lib/curate.ts` via `Promise.all` in the client), and a cache entry is only readable once the first response begins streaming — concurrent requests all miss. Best case saves roughly **$0.01 per run**, under 3%. Not the lever.

### Does a sweep re-judge the whole result set every time?

**Measured: no. It judges only what is new.**

`lib/sweep.ts:104` filters the fetched listings against a per-owner, per-watch seen-set before any photo is fetched:

```ts
if (seenSet.has(dedupeKey(item))) return false;
```

And `lib/sweep.ts:107` returns before the model call when nothing fresh survives. Everything *considered* is marked, not just what was reported (`recordSwept`), so rejected listings are not re-judged and re-paid for. The seen-set holds 400 keys per watch (`lib/watches.ts:41`).

### How many candidates reach the vision step?

**Measured as a ceiling; not measured live.** The instrumentation logs the real number per call.

- The pool is capped at **120** listings (`lib/sources/index.ts:135`), interleaved across up to 10 queries
- Curation looks at `MAX_VIEWED = 16` per call × `MAX_BATCHES = 3` = **48 maximum** reach the model (`lib/batching.ts:28,38`)
- A candidate without a fetchable photo is dropped before the call (`lib/curate.ts:63`), so the real number is ≤48

**Not run over 5 runs — no credentials.** `node scripts/cost-report.mjs` prints "candidates reaching the vision step" once you have logs.

### If two users see the same eBay listing, do we judge it twice?

**Measured: yes. There is no cross-user cache of any kind.**

`dedupeKey` (`lib/sources/index.ts:44`) is used in exactly two places, neither of which is a judgement cache:
1. De-duplicating listings *within a single search* (`lib/sources/index.ts:178`)
2. The per-owner, per-watch seen-set (`lib/sweep.ts:104`)

Two users searching for the same thing on the same day pay twice for the same listing. At launch this costs nothing (no overlapping users). At scale in a niche vertical — where everyone is searching "waxed cotton jacket" against the same eBay inventory — the overlap could be large. **Unmeasured.**

### Is there a cap on standing scans per account?

**Measured: yes.** `lib/plans.ts:34,39` — free: **0**, member: **10**. Enforced at `app/api/watches/route.ts` before creation, and that check is not bypassable by a missing cookie because the route 401s without an owner.

### How often do scans run, and where is the schedule defined?

**Measured.** `.github/workflows/sweep.yml` — `cron: "0 8,20 * * *"`, i.e. **08:00 and 20:00 UTC, twice daily**. It calls `GET /api/cron/sweep` with a bearer `CRON_SECRET`. `PEOPLE_PER_RUN = 25` (`app/api/cron/sweep/route.ts:22`) caps how many people one invocation handles; the sweep is resumable, so the rest are picked up next run.

The schedule was moved out of `vercel.json` because Vercel Hobby fires crons once a day at most.

---

## 4. Cost per user per month

**Estimated**, from the §2 per-operation figures. Free-tier numbers use the limits actually enforced in `lib/plans.ts:34`.

| | Closets | Sweeps | Judgements | Fit lookups | Model cost/mo |
|---|---:|---:|---:|---:|---:|
| **Free** (enforced cap) | 1 | 0 | 3 (shared with fit) | — | **$0.51** |
| **Free** (cookie cleared weekly) | 4+ | 0 | 12+ | — | **$2.05+** |
| **Free** (calling the open endpoints directly) | **unbounded** | 0 | unbounded | — | **unbounded** |
| **Member — light** (2 watches, 2 closets) | 2 | 120 | 5 | 2 | **$8.79** |
| **Member — typical** (5 watches, 4 closets) | 4 | 300 | 15 | 5 | **$21.10** |
| **Member — heavy, at the cap** (10 watches) | 8 | 600 | 40 | 20 | **$45.63** |

Sweep cost assumes 6 fresh listings per sweep. Judgements and fit lookups are **unlimited** for members (`lib/plans.ts:36-38` — `UNLIMITED`), so the heavy row is a usage guess, not a ceiling. **There is no upper bound on a member's judgement or fit spend.** The only member limits are 10 watches and 200 wardrobe garments.

Revenue against all of this is **$0** — no payment integration exists.

---

## 5. The cheap version

**Estimated.** Per closet run, from a $0.3619 baseline.

| Change | New cost/run | Saved | Files to change |
|---|---:|---:|---|
| Resize product images to 224×224 | $0.3269 | 10% | `lib/thumbnails.ts` (add a resize), `lib/sources/menswear.ts:110` |
| Haiku 4.5 first pass, Opus on survivors | $0.2450 | 32% | `lib/curate.ts`, `lib/batching.ts`, `lib/anthropic.ts` (a second model constant) |
| Cache judgements per listing | no change at launch | 0% now | `lib/judge.ts`, new Redis key |
| Cache brand advice per brand+size | no change at launch | 0% now | `lib/fit.ts` (sources are cached; the *model call* is not) |
| **Drop curate effort medium → low** | **$0.2841** | **21%** | one line: `lib/curate.ts:96` |
| All of the above | ~$0.19 | ~48% | |

Notes on each:

- **224×224 is a bad trade.** It saves $0.035 because images are already only ~10% of the bill after the s-l400 rewrite, and you cannot assess a garment's cut, condition, or material at 224px. The whole product premise is that the photo is the evidence. Don't.
- **The Haiku pre-pass is the real win.** Haiku 4.5 is $1/$5 against Opus 5's $5/$25 — five times cheaper on both sides. Run Haiku over all 48 candidates to reject the obvious (womenswear, lots, stock photos, damage), then send the ~16 survivors to Opus. Saves ~$0.12/run and probably improves results, since Opus then sees a denser field.
- **Effort is the cheapest change available.** One line. Output is 69% of the bill and curate is most of the output. Whether picks get worse is an eval question — the comment at `lib/curate.ts:90` already records that high effort didn't measurably beat medium, so low may well hold too.
- **Both caches are worth building before scale, not now.** They save nothing until two users want the same thing. The listing cache needs a TTL short enough to respect eBay's caching terms (see below).

### Per member per month, after the cheap version

| | Now | Haiku pre-pass + low effort |
|---|---:|---:|
| Member — light | $8.79 | $5.94 |
| Member — typical | $21.10 | $14.27 |
| Member — heavy | $45.63 | $30.86 |

Sweeps use the same curate path, so both changes apply to them too.

---

## 6. Terms we may be breaching

**Every item here is UNKNOWN.** The egress proxy blocked `developer.ebay.com`, `partnernetwork.ebay.com`, and `vercel.com`, so no terms document was readable. What follows is **what the code does** that would fall in scope, so you can check each against the actual terms. I have not read the clauses and will not paraphrase them from memory.

### Are we sending eBay listing data to an LLM?

**Yes — measured, and it is central to the product, not incidental.** Every curate call sends, per listing: the eBay item id, price, condition, full title (`lib/curate.ts:75`), and the product photograph fetched from eBay's CDN (`lib/curate.ts:79-84`). Up to 48 listings per closet run. The same happens on every sweep and every judgement.

**UNKNOWN — need to check** whether eBay Partner Network or the Browse API licence requires written approval for AI/LLM processing. If it does, this needs approval before launch, not after.

### Are we storing eBay listing data longer than 6 hours?

**Yes — measured, far longer.**

| Store | Retention | Where |
|---|---|---|
| Closet contents (title, price, url, imageUrl, condition, merchant) | **90 days** | `lib/closet.ts:8` — `CLOSET_TTL_SECONDS` |
| Kept closets | **Forever** — expiry removed via `persist()` | `lib/library.ts` `keepCloset` |
| Published closets on `/discover` | Forever, plus 4 thumbnail URLs | `lib/social.ts` |
| Watch seen-sets (dedupe keys derived from titles) | Until displaced, 400 per watch | `lib/watches.ts:41` |
| Taste statistics (brand, material, colour per pick) | **365 days** | `lib/taste.ts:24` |

**UNKNOWN — need to check** the eBay API licence's caching clause. If a 6-hour limit applies, the 90-day closet TTL and the permanent kept/published closets are both non-compliant, and this is a design change, not a config change: the whole "saved closet" feature depends on retaining listing data.

### Does the Vercel plan allow paid subscriptions and affiliate links?

**UNKNOWN.** The dashboard sidebar shows **Hobby** (observed in a screenshot). Vercel's Hobby terms have historically restricted commercial use, but `vercel.com` is blocked and I will not quote terms I could not read. **Check <https://vercel.com/docs/plans/hobby> before taking a single payment.** If Hobby prohibits commercial use, the domain currently serving `levozlabs.com` is the thing at risk.

### Other things noticed while reading the integrations

- **`/api/image` is an open image proxy.** It fetches arbitrary URLs and returns the bytes (`app/api/image/route.ts`). It is SSRF-guarded (`fetchableUrl` rejects loopback, link-local, and private ranges) and content-type/size capped, but it is unauthenticated and uncapped. Someone could use your Vercel bandwidth as a proxy. Low severity, worth a rate limit.
- **No robots/ToS check on `lib/websearch.ts`.** The brand-fit feature fetches arbitrary pages found via search and sends their text to the model. It sends a browser User-Agent and does not check `robots.txt`. Whether that matters depends on the sites hit — it is worth knowing that it is happening.
- **Affiliate links are not implemented.** `itemAffiliateWebUrl` is not used anywhere; listings link to the plain `itemWebUrl`. So there is currently no affiliate revenue and no affiliate-disclosure obligation.

---

## Replacing the estimates

The instrumentation is committed and off by default.

```bash
# 1. Turn it on and drive the app
COST_LOG=1 npm run dev 2>&1 | tee /tmp/run.log

# 2. Do each operation once: build a closet, judge a piece, check a brand,
#    build outfits, and trigger a sweep with
#    curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/sweep

# 3. Read the real numbers
node scripts/cost-report.mjs < /tmp/run.log
```

It prints per-operation input/output/cache tokens, the **actual pixel dimensions** of every image sent, the real candidate count reaching the vision step, cost in dollars, and the input-vs-output split.

- `lib/meter.ts` — gated on `COST_LOG=1`, logs only, cannot throw. 12 tests in `scripts/meter.test.mjs` cover the gate, the pricing arithmetic, the image-header parser, and that malformed input never throws.
- `scripts/cost-report.mjs` — aggregates the log lines into the tables above.
- `scripts/cost-model.mjs` — the analytical model that produced the estimates here, so you can vary the assumptions.

Then compare the total against the Anthropic console for the same window. If they disagree, the log is wrong and this document should be corrected.

---

## What to do first

Ranked by money at risk, not by effort.

1. **Put a quota check in front of `/api/style/analyze` and `/api/style/curate`.** They are open, unauthenticated, and each call costs an estimated $0.36. Nothing else on this list matters if someone finds them.
2. **Make a missing cookie fail closed.** `allowance(null, …)` currently returns `allowed: true`. It should refuse, or mint an identity first.
3. **Check the eBay terms on AI processing and on caching** before launch. Both are structural — if either bites, it changes the design, not a setting.
4. **Check whether Vercel Hobby permits commercial use** before taking a payment.
5. **Run the instrumentation** and replace every "estimated" in this document with a measurement.
6. Then, and only then, tune effort and add the Haiku pre-pass.
