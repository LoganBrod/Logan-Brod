# LevoZ Labs

One Next.js app serving both halves of the company:

| Route | What it is |
|---|---|
| `/` | The marketing site — one scroll-driven walk down a wardrobe corridor |
| `/closet` | Clozet — upload pieces you like, get one built from real listings |
| `/closet/tools` | Sizing, "is this any good?", and standing scans |
| `/closet/saved` | Every Clozet you've built |
| `/closet/[code]` | A saved Clozet |
| `/accessories` | The small things, chosen against the style a Clozet read |
| `/colognes` | Recommended rather than searched — see the page for why |
| `/calibrate` | Fifteen swipes that sharpen the profile, with no model call |
| `/feedback` | Bug reports and suggestions — no account, straight into Redis |
| `/admin` | Traffic: who showed up, from where, how far they got |
| `/api/**` | The endpoints (Claude, eBay, Google Shopping, auth, taste, fit, social) |

Clozet's three tabs are real routes, so each one is linkable, openable in a new
window and reachable with the back button. Closet codes are six uppercase
characters, so `tools` and `saved` can never collide with `/closet/[code]`.

Five paths redirect rather than 404, because every one of them has been linked
from the menu, the footer, or somebody's bookmarks:

| Was | Now |
|---|---|
| `/tools`, `/sizing`, `/scan` | `/closet/tools` (the last two anchored) |
| `/closets` | `/closet/saved` |
| `/wardrobe`, `/discover` | `/closet` — both are off the menu for now |

Wardrobe and Discover are off the menu, not deleted: their components, API
routes and tests are all still here, and putting either one back is one page
file.

## Layout

- `app/components/SideNav.tsx` — the shared menu, despite the name: a button
  fixed top-left that opens a panel. Mounted once in the root layout, so it is
  the same on both halves. It used to be a permanent rail, which cost 13rem of
  every page and boxed the marketing walk into a frame. Closes on Escape, on the
  backdrop, and on arriving somewhere new.
- `app/(marketing)/` — the corridor walk. Its layout mounts Lenis smooth scroll,
  which does not load on product routes. There was a custom cursor here too — a
  dot with a trailing ring — removed because a ring that lags the pointer makes
  people doubt the page is listening.
- `app/(app)/` — the product. Its layout only leaves room for the menu button.
- `app/api/` — unchanged from the standalone product; paths did not move.
- `lib/copy.ts` — every word the marketing side says, in one file.
- `public/frames/` — 197 JPEGs: the doors opening, then the corridor walk.
  Fetched only by the marketing route.

## Run it

```bash
npm install
cp .env.local.example .env.local   # fill in at least ANTHROPIC_API_KEY + the eBay pair
npm run dev                        # http://localhost:3000
npm test                           # the product's suite
```

## Deploy

One Vercel project, **Root Directory `site`**. The marketing page prerenders as
static; product routes are server-rendered on demand. Set the env vars from
`.env.local.example` in the Vercel project — the marketing half needs none of
them, but the product will not run without them.

The twice-daily standing-closet sweep is scheduled from
`.github/workflows/sweep.yml`, not from the host. Vercel's Hobby plan allows two
cron jobs and triggers them once a day, which a twice-daily sweep doesn't fit;
`/api/cron/sweep` is a plain authenticated `GET`, so any scheduler can drive it
and GitHub Actions is free. It needs two settings under the repository's
Settings → Secrets and variables → Actions:

| | |
|---|---|
| secret `CRON_SECRET` | the same value as the deployment's |
| variable `SITE_ORIGIN` | e.g. `https://www.levozlabs.com` |

Without `CRON_SECRET` set on the deployment the endpoint refuses every request —
deliberately, so an endpoint that spends money on model calls is never left open.
GitHub disables scheduled workflows after 60 days without a push, so if sweeps
stop arriving after a quiet stretch, re-enable it on the Actions tab.

Six routes declare a `maxDuration` above 60s, which is the Hobby ceiling — see
`RAILWAY.md` for what that costs and what to do about it.

`LAUNCH.md` is the pre-launch checklist: every setting, secret, quota, walk-through
and missing page that stands between a green build and strangers using the site.

### Four things that will make a green build serve the wrong thing

Each of these cost us a round of "why can't I see the changes".

1. **Root Directory must be `site`.** The repository root is a *second*, unrelated
   Next app. Leave the field empty and Vercel builds that one instead, with no
   error to tell you so.
2. **Empty commits never deploy.** The project has *skip deployments when there
   are no changes to the root directory* enabled — right, because commits that
   only touch the repo root shouldn't rebuild this app. The consequence is that
   `git commit --allow-empty` is silently discarded. To force a rebuild, change a
   file under `site/` or use Vercel's Redeploy button.
3. **`--ff-only` merges don't produce a production build.** Fast-forwarding
   `master` to the feature branch leaves both refs on the same SHA. Vercel builds
   a SHA once and credits it to whichever ref it saw first — the branch — so the
   build lands as a Preview and `master` never gets a Production one. Merge with
   `--no-ff`, or push a `site/` change to `master` directly.
4. **The product is at `/closet`, not `/`.** `/` has been the marketing corridor
   since the two apps merged. A bookmark to `/` looks like the app disappeared.

## How the product works

`PRODUCT.md` is the product's own documentation — the pipeline, why it recommends
what it does, how sign-in and saved closets work. It moved here unchanged when the
two apps merged.

## Measuring recommendations

Every search query a run writes is followed from the marketplace to a person's
reaction: how many listings it found, how many the judge saw, how many reached
the rail, how many were scrolled to, opened, clicked through, or voted on.
Aggregated across everyone, because the question is about the searches - a
query either produces kept pieces or it doesn't. `lib/yield.ts` holds it.

```bash
SITE_ORIGIN=https://www.levozlabs.com ADMIN_SECRET=… node scripts/query-report.mjs
```

prints the table, proven searches first. `ADMIN_SECRET` falls back to
`CRON_SECRET`; unset means the report is closed.

**The second search.** When a run judges everything and keeps fewer than six
pieces, it asks for replacement queries that fix *why* - given what each
search produced and what the judge said about the pool - searches once more,
judges only what it hasn't seen, and merges. Once. A failure there costs only
the second pass; the first pass's pieces are already hanging.

## Fifty people at once

```bash
npm run build
npx tsx scripts/load/run.mjs --users 50             # distinct addresses
npx tsx scripts/load/run.mjs --users 50 --shared-ip # one office, one address
```

Starts a production server whose outbound fetches are redirected to
`scripts/load/fake-upstream.mjs` - Anthropic, eBay, SerpAPI, Resend and the
listing pages, imitated with realistic delays - and a fake Upstash with a
per-command delay, then walks fifty virtual users through the whole product
with their own cookies and addresses. Prints latency per step, every non-2xx,
the server's peak memory, Redis command volume, model calls per user, and
whether the per-query records survived the concurrency. `--speed 0.1` makes
the imitations ten times faster for a smoke run. No key is real and no request
leaves the machine.

It found four things the first time it ran: a run charged twice against the
monthly allowance, so a free account could never save its first clozet; DNS
lookups for thumbnails queueing behind Node's four-thread pool; the per-query
records losing most of their index to a read-modify-write race; and, from one
shared address, other people's rejected runs starving a legitimate run of its
second search.

## Where the pieces come from

Three sources, and which of them a run asks is the "Where from?" setting on
the form: secondhand, new, or both.

| | |
|---|---|
| eBay | The only one carrying both. The setting picks its condition filter. |
| Google Shopping | Retail, through SerpAPI. `SERPAPI_QUERY_CAP` decides how many of a run's ten searches it sees - four on the free tier, raise it on a paid one. |
| The brands' own shops | Every Shopify store serves its catalogue at `/products.json`. Named in `SHOPIFY_STORES`, cached for a day, searched locally. No key, no quota. Six stores are read at a time and 400 garments kept from each, and the twice-daily sweep refreshes all of them so a cold cache never lands on somebody's run. |

Before adding a brand, check it actually serves one. From `site/`, on a
machine with normal internet access:

```bash
npm install
npm run probe:shopify taylorstitch.com buckmason.com 3sixteen.com
```

It reports per domain whether the endpoint answered, how many usable garments
came back, the price range and three sample titles, then prints the
`SHOPIFY_STORES=` line to paste into the deployment. It writes nothing, so run
it as often as you like while choosing brands.

The source itself is tested against a local server serving a real-shaped
payload, which covers the parsing, the matching, the caching and what happens
when a store is unreachable. The probe is the other half: only a machine that
can reach a brand's website can tell you whether that brand answers.

## What the free tier gets

Three clozets a week, two of them keepable, three questions — reset every
Monday, UTC. It was one clozet a month, which is the wrong unit for something
people are meeting for the first time: a month means "come back in three
weeks", which means don't. The cycle is per-meter in `lib/plans.ts`, and
`/api/auth` reports both what's used and when it comes back, which is what the
corner dock reads.

## Is anybody showing up

`/admin`, behind `ADMIN_SECRET`. No third-party script, no second service, no
cookie banner: `/api/beacon` writes counters into the Redis that is already
there, and `lib/analytics.ts` reads ninety days back out of them.

A visitor is a daily rotating hash of address and browser string — the same
approach Plausible takes — fed to a HyperLogLog, which answers "how many
distinct" and cannot answer "was this one of them". So there is no visitor
table to leak and nothing that follows a person between days. It began as the
existing taste cookie and that was wrong in the one place it mattered: somebody
arriving from a video onto the marketing page has never been given one, so the
entire audience counted as zero people.

Every field name is drawn from an allowlist before it reaches Redis — paths,
referrers and events alike. That is the load-bearing part rather than a
tidiness measure: this is a public write endpoint, and a field name taken from
a request is a hash a stranger can grow to any size they like.
`scripts/analytics.test.mjs` is mostly about that.

The funnel is what to read — landed, started the quiz, uploaded, ran, got
pieces back, saved — measured against visits rather than pageviews. Add `?c=`
and a short tag to a link to tell one video from the next.

## Security

What is enforced, and where, so a change to any of it is a visible change.

- **Identity.** A session is a 256-bit random token in an `HttpOnly; Secure;
  SameSite=Lax` cookie, looked up in Redis and renewed on use. Anonymous
  browsers get a UUIDv4 the same way. Both cookie names are matched at a cookie
  boundary, so a longer name that ends the same way cannot be read as one.
  (`lib/accounts.ts`, `lib/taste.ts`)
- **Passwords.** scrypt from Node's standard library with a per-hash salt and a
  self-describing format; a wrong password and an unknown address take the same
  time and return the same message. Ten attempts per address per fifteen
  minutes. (`lib/passwords.ts`, `lib/accounts.ts`)
- **Sign-in links.** Single-use through `GETDEL`, fifteen-minute expiry, five
  per address per hour. The link's origin comes from `APP_ORIGIN`, never from
  the request's Host header - a Host header is whatever the caller sends, and
  a link built from it is an account-takeover vector. Production refuses to
  mint links until `APP_ORIGIN` is set. (`app/api/auth/route.ts`)
- **Ownership.** Every read and write of a closet, library, watch, like or
  taste record is keyed by the request's owner. Publishing or deleting a closet
  checks `isOwned` and answers 403 for a code that is not yours.
- **Outbound fetches.** Every URL the app fetches that it did not write itself
  - pasted listing links, marketplace photos, size-guide pages, the image proxy
  - goes through `lib/safeFetch.ts`: the hostname must resolve only to public
  addresses (literal or DNS, in every IPv4 and IPv6 spelling), and redirects
  are followed by hand with each hop re-checked. Residual risk: DNS rebinding,
  named in that file.
- **Spend.** Every route that calls a model or a marketplace is limited per
  network address (`lib/ratelimit.ts`, last `X-Forwarded-For` hop, fails
  closed if Redis errors). The image proxy is limited the same way, and so is
  saving a closet — not a model call, but an unbounded way to allocate Redis
  keys. `scripts/spend-guard.test.mjs` walks the route files and fails the
  build if a route reaches a model or a marketplace without one; the two
  exemptions are the cron and report endpoints, which are behind secrets.
  A meter is not a limit: quotas count against a cookie, and the attacker's
  move is to send no cookie. `/api/fit` was metered and unlimited for exactly
  that reason, which is what the guard exists to stop happening again.
- **Cron.** `/api/cron/sweep` requires `CRON_SECRET`, compared in constant
  time; unset means closed.
- **Email.** Every field in a digest is HTML-escaped, including the listing
  URL, which is also held to http(s).
- **Headers.** `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy,
  a minimal `Permissions-Policy`, and HSTS on every response
  (`next.config.js`). No CSP yet - the marketing walk needs a report-only pass
  first.
- **Secrets.** Every third-party key is read server-side only. The two
  modules the browser imports from are split off precisely so the SDK never
  reaches the client bundle (`lib/accessoryKinds.ts`, `lib/cologneOptions.ts`).

Known and accepted: an account that exists but has no password returns a
distinct message on password sign-in, so that address can be shown to have an
account. It is the only way to tell that person to use a link instead. And
`next` 14 carries advisories that mostly do not reach this app (no Server
Actions, `next/image`, rewrites or middleware); the upgrade to 16 is a major
version and is deliberately not bundled into a security pass.

## A note on the name

The product is **Clozet**; the route is `/closet`. That mismatch is deliberate —
every saved closet's link and every share card carries a `/closet/CODE` URL, so
renaming the route would break links already in the wild. The spelling is a
display decision, and it stops at the surface: wire fields, types, cookies and
Redis keys all still say `closet`.
