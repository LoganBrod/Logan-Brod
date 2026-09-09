# Before launch

Every check between this repo and strangers using it, in the order that they
stop the site from working. Where a check names a file, that file is where the
behaviour lives, so you can confirm it rather than trust this list.

**We deploy on Railway.** An earlier version of this file assumed Vercel; the
differences are called out where they matter.

---

## The short version, if you are launching this week

These are the ones that break the product or embarrass it. Everything after
section 5 can follow you into week two.

1. Every environment variable set on the Railway service, in **production**
   (section 2). Two of them are new since the first draft: `ADMIN_SECRET` and
   `APP_ORIGIN`.
2. The service points at **`site/`**, runs on **Node 22**, and has **1 GB** of
   memory (section 1).
3. An **Anthropic spend limit** with an alert, and eBay production keys
   (section 3).
4. `CRON_SECRET` on the deployment **and** in GitHub Actions, with
   `SITE_ORIGIN` pointing at the live domain (section 2). The sweep is not
   optional any more: it keeps the quiz's deck warm.
5. **The walk-through in section 6**, done on the real domain, on a phone.
6. **A privacy page and an Open Graph image** (section 8). The first is what a
   stranger looks for; the second is what they see when your link is pasted
   into a chat.

---

## 1. The deployment

- [ ] **The Railway service builds from `site/`.** The repository root is a
  second, unrelated Next app. `railway.json` carries the build and start
  commands; the service's root directory has to be `site` or it builds the
  wrong one.
- [ ] **Node 22.** The app was built and tested on it and nothing in the repo
  pins it.
- [ ] **1 GB of memory, at least.** Fifty simultaneous runs peaked near 450 MB
  in the load simulation, and that was with placeholder images rather than real
  thumbnails, so treat that as a floor. Railway bills by usage, so headroom is
  cheap. Memory is the constraint here, not duration.
- [ ] **No function timeout to worry about.** Six routes declare a
  `maxDuration` above 60 seconds. That was the single largest blocker on
  Vercel's Hobby plan and simply does not apply to a long-lived process.
- [ ] **The health check passes.** `railway.json` polls `/`, which is the
  marketing page and needs no environment variables, so a deploy with a missing
  key still goes green. That is deliberate, and it means a green deploy is not
  proof the product works. Section 6 is that proof.
- [ ] **Typecheck, tests and build are green on the launch commit**:
  `npm run typecheck`, `npm test`, `npm run build`.
- [ ] **Custom domain attached, one canonical host chosen** (`www` or apex, not
  both). `APP_ORIGIN` and the GitHub `SITE_ORIGIN` variable must both be that
  exact host.
- [ ] **HSTS is on with `includeSubDomains`** (`next.config.js`). Every
  subdomain of the launch domain has to be HTTPS from now on.

## 2. Environment variables

Set these on the Railway service.

| Variable | Without it | Where it comes from |
|---|---|---|
| `ANTHROPIC_API_KEY` | Every run fails at analysis | console.anthropic.com |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | No listings at all | developer.ebay.com, **production** keyset |
| `EBAY_ENV=production` | Sandbox listings, which are fake | you |
| `SERPAPI_KEY` | eBay only; the site still works | serpapi.com |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No saving, no accounts, no taste memory, **and every model route answers 429** (rate limiting fails closed) | Upstash console |
| `RESEND_API_KEY`, `MAIL_FROM` | No sign-in at all in production | resend.com |
| `APP_ORIGIN` | Sign-in links refuse to mint | the canonical host, no trailing slash |
| `CRON_SECRET` | The sweep is closed, and the quiz's deck goes cold | any long random string |
| `ADMIN_SECRET` | Falls back to `CRON_SECRET`; both unset closes the query report | any long random string |
| `MEMBER_EMAILS` | Nobody is a member; everyone gets the free allowance | comma-separated addresses |

- [ ] **All of them set**, then confirmed by using the site rather than by
  reading the dashboard.
- [ ] **Rotate any key that has been pasted into a chat, an issue or a
  screenshot.** A key that has been seen is burned.
- [ ] **`MAIL_FROM` is on a verified domain.** `onboarding@resend.dev` only
  delivers to the address that signed up for Resend, so sign-in silently works
  for you and for nobody else. Verify the launch domain in Resend and switch.
- [ ] **eBay keyset is production**, not sandbox. Sandbox listings look real
  and are not.
- [ ] **GitHub → Settings → Secrets and variables → Actions:** secret
  `CRON_SECRET` matching the deployment, variable `SITE_ORIGIN` set to the live
  host. The sweep runs from `.github/workflows/sweep.yml`, twice daily.

## 3. Spend and quotas

A run is about ten marketplace queries and up to seven model calls, plus, when
the first pass comes back thin, one more query-writing call and a second search
of up to six queries.

- [ ] **Anthropic spend limit set, with the alert email on.** This is the one
  bill that scales with strangers.
- [ ] **SerpAPI quota checked.** A shop call uses up to four searches, and a run
  can make two shop calls. The free tier is a hundred a month, so somewhere
  between twelve and twenty-five runs. Either buy a tier or leave `SERPAPI_KEY`
  unset and launch eBay-only; the site handles both. The quiz used to spend
  four of these per visitor and now spends four per week.
- [ ] **eBay daily call cap** covers the expected day. A run is ten to sixteen
  calls; the quiz's deck is fifteen more, once a week.
- [ ] **Upstash plan** has headroom. A full visit measured about 730 commands
  in 200 round trips.
- [ ] **Per-address rate limits reconsidered** (`lib/ratelimit.ts`): analyze 6
  an hour, requery 6, shop 30, curate 40, judge 30, all keyed by network
  address. Six runs an hour is generous for one person and tight for an office,
  a dorm or a mobile carrier, where everyone shares one address. If your first
  visitors will arrive from one place, raise `analyze` before you announce.
- [ ] **Free plan allowance** (`lib/plans.ts`): one closet, one keep, three
  judgements. Confirm that is the offer.

## 4. Security

The README's Security section says what is enforced and where. These confirm it
is live on the real host.

- [ ] **`/api/report/queries` answers 401 without the bearer token**, 200 with.
- [ ] **`/api/cron/sweep` answers 401 without `CRON_SECRET`.**
- [ ] **The sign-in link points at `APP_ORIGIN`.** Request one, read the email,
  check the domain.
- [ ] **Session cookie is `HttpOnly; Secure; SameSite=Lax`** in the browser's
  storage panel. Secure cookies do not set over plain HTTP, so this only proves
  out on the real host.
- [ ] **A pasted listing URL to a private address is refused.** Paste
  `http://169.254.169.254/` into "is this any good?" on a finished clozet and
  confirm it is rejected rather than fetched (`lib/safeFetch.ts`).
- [ ] **Response headers present:** nosniff, `X-Frame-Options: DENY`, referrer
  policy, permissions policy, HSTS.
- [ ] **No Content-Security-Policy yet.** Known and deliberate; the marketing
  walk needs a report-only pass first. Not a blocker.
- [ ] **`npm audit --omit=dev` re-read.** At the launch commit it is Next 14
  advisories that do not reach this app plus build-time PostCSS ones. The fix
  is Next 16, a major upgrade, deliberately not bundled into launch.
- [ ] **Redis fails closed**, and you know what that looks like: an Upstash
  outage makes every model route answer 429, which reads as "the site is rate
  limiting everyone".
- [ ] **No secrets in the client bundle.** After a build, grep `.next/static`
  for `sk-ant` and for the eBay secret. Both return nothing.

## 5. Data

- [ ] **Know who owns the Upstash database.** If it was created through
  Vercel's storage marketplace, deleting that project can take the data with
  it. `RAILWAY.md` section 0 is the check, and it is the one step here that can
  lose everything.
- [ ] **Expiry understood.** Closets 90 days, renewed on read. Sessions 30
  days, renewed on use. Taste a year. Query yield 90 days. The quiz's deck 30.
- [ ] **Backups on, or accepted as off.** Upstash backs up daily on paid tiers.
- [ ] **Eviction off.** With eviction on, a full database drops keys, and the
  first to go may be somebody's account.
- [ ] **Photos are never stored.** Uploads are downscaled in the browser and
  sent to the model inline. The privacy page will say so; confirm it is true.

## 6. The walk-through

On the real domain, in a private window, on a phone and a laptop. A green
deploy means the code compiles. This is the proof that the product works with
production keys.

- [ ] **First visit:** the quiz opens over the form within a second or two. It
  is fifteen cards, skippable, and can be retaken.
- [ ] **A full run** with three to five real photos completes and hangs twelve
  pieces, or fewer with the "found less" state, in under two minutes. Read the
  profile it wrote: it should describe those photos.
- [ ] **A thin run** (one odd photo) triggers the second search. The progress
  copy changes to "Searching again with better terms".
- [ ] **A run that fails partway** (wifi off mid-curation) ends in an error
  that names what happened and offers a retry.
- [ ] **Votes persist** across a reload, and the next run's memo quotes the
  right titles.
- [ ] **"Get started" from the front page always starts a new one**, even when
  you already have a clozet saved. So does "Start another" in the header.
- [ ] **A plain visit to `/closet` reopens your last clozet**, which is the
  intended difference.
- [ ] **Sign-in link:** request, receive, open, land signed in. Open it again:
  refused. Six requests in an hour: the sixth refused.
- [ ] **Password sign-in:** a wrong password and an unknown address take the
  same time and say the same thing.
- [ ] **Save a clozet**, open `/closet/CODE` in another browser, confirm it
  renders. Delete it from a browser that does not own it: 403.
- [ ] **Share card** renders, and a listing whose photo has gone shows a
  placeholder rather than a broken tile.
- [ ] **Tools:** measurements save and show on the next run. A brand lookup
  returns a bold line, two measurements and a size. It is the only section on
  that page now.
- [ ] **Accessories and colognes** open from a finished clozet and answer in
  its register. Colognes recommend; they never search a marketplace.
- [ ] **Calibrate** runs its fifteen swipes with no model call.
- [ ] **Old links redirect:** `/tools`, `/sizing`, `/scan`, `/closets`,
  `/wardrobe`, `/discover`.
- [ ] **The page is light on a phone set to dark.** There is one palette now,
  and the browser chrome should match it rather than framing the page in black.
- [ ] **Mobile Safari:** the file picker opens the camera roll, the hero does
  not jump when the address bar collapses, nothing scrolls sideways.
- [ ] **A nonsense URL** shows a 404 with a way back.
- [ ] **The marketing walk** loads its 197 frames without stalling on Fast 3G.
- [ ] **The query report works against production:**
  `SITE_ORIGIN=https://… ADMIN_SECRET=… node scripts/query-report.mjs`.

## 7. Quality gates

- [ ] `npm test` green (383 tests at the launch commit).
- [ ] `npm run typecheck` clean.
- [ ] **ESLint is not configured.** `npm run lint` opens Next's setup prompt
  rather than linting. Either answer it once and commit the config, or accept
  that typecheck and tests are the only static gates.
- [ ] `npm run audit:contrast` passes against a fresh production build. It
  needs the server stopped and restarted after building, or it audits stale
  pages. One palette now, so it runs once.
- [ ] **The load simulation runs clean:** `npx tsx scripts/load/run.mjs
  --users 50`. Zero non-2xx, every run saved, every query in the report. No
  key is real and nothing leaves the machine.
- [ ] **Lighthouse** on `/` and `/closet`, mobile. No red accessibility items.
- [ ] **Asset weight is known.** The corridor frames, the three videos and the
  garment images are the bulk of a first visit.

## 8. What a public site is expected to have

None of these stop the code running. All are missing at the launch commit, and
each one is visible the moment a stranger, a search engine or a chat app
touches the URL.

- [ ] **Open Graph and Twitter card metadata.** The root layout sets a title
  and description and nothing else, so a link pasted into iMessage or Slack
  shows a bare domain. Add an `opengraph-image`.
- [ ] **Icons.** `app/icon.svg` exists; there is no PNG fallback, no
  apple-touch-icon and no web manifest. iOS Safari ignores SVG icons.
- [ ] **`robots.txt` and a sitemap.** Decide what is indexed. `/` yes;
  `/closet/[code]` probably not, since each is somebody's saved clozet.
- [ ] **A privacy page.** Photos go to Anthropic for analysis and are not
  stored; a random cookie identifier remembers taste; an email is stored only
  on sign-in; clozets expire after ninety days; searches go to eBay and Google
  Shopping; nothing is sold. Link it from the footer and the sign-in form.
- [ ] **Terms**, even short: listings belong to their sellers, prices and
  availability are theirs, LevoZ Labs sells nothing.
- [ ] **A way to contact you**, and a way to delete an account on request.
- [ ] **Affiliate disclosure** the day any affiliate tracking is added. None
  today.

## 9. Knowing when something breaks

- [ ] **Error reporting wired in, or accepted as absent.** At minimum know
  where Railway's deploy logs are and read them the first evening.
- [ ] **Uptime check** on `/` and on `GET /api/taste`, which answers with
  `configured: true` when Redis is reachable.
- [ ] **Spend alerts:** Anthropic's, and Upstash's usage emails.
- [ ] **The cost meter works:** `COST_LOG=1` on the deployment prints one JSON
  line per model call; `scripts/cost-report.mjs` turns a log into a table.
- [ ] **The query report read weekly for the first month.** It is the only
  evidence the recommendations are any good, and the starved and
  wrong-register queries at the bottom are the prompt work.
- [ ] **GitHub disables the sweep after sixty days without a push.** If the
  quiz's deck goes stale, the Actions tab is the first place to look.

## 10. The runbook for the first bad day

- **Anthropic down or over its limit:** every run fails at analysis with a 502
  naming the model. Wait or raise the limit.
- **Upstash down:** every model route answers 429 and saving fails. Fail-closed
  by design. Riding out a long outage means changing the limiter to fail open,
  which is a deliberate code change.
- **eBay token errors:** a disabled keyset produces empty pools, which look
  like "found nothing". Check the developer portal before touching prompts.
- **SerpAPI quota exhausted:** results silently become eBay-only. Not an
  outage.
- **Rollback:** Railway's deployment list, redeploy the previous build.
- **Follow-up on a merged branch:** restart the branch from `master`. Never
  stack on merged history.

## 11. Launch day

- [ ] Section 6 done on the production host within the last day.
- [ ] Someone watching the logs for the first hour.
- [ ] Rate limits reconsidered for how the first visitors will arrive.
- [ ] The announcement link pasted into a chat app once, to see the preview.
- [ ] The query report run at the end of the day.

## What is deliberately switched off

So that nobody launches expecting them.

- **Standing scans.** Built, tested, and off. The list that manages one lived
  only on the Tools page, so offering to start something nobody could stop was
  worse than not offering it (`lib/features.ts`). The sweep still runs, because
  it keeps the quiz's deck warm.
- **"Is it any good?" on the Tools page.** Still available under a finished
  clozet, which is where the question comes up.
- **Wardrobe and Discover.** Off the menu, redirecting to `/closet`.
