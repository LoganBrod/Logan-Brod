# Before launch

Every check that stands between this repo and strangers using it. Each one is
either something that has already bitten this project, something the code
relies on being true in production, or something a public site is expected
to have. Tick them in order; the early sections are the ones that stop the
site from working at all.

Where a check names a file, that file is where the behaviour lives, so you can
confirm it rather than trust this list.

---

## 1. The deployment itself

- [ ] **Vercel Root Directory is `site`.** The repository root is a second,
  unrelated Next app. Empty field means Vercel builds that one, with no error.
- [ ] **Production comes from `master`, merged with `--no-ff`.** A
  fast-forward leaves both refs on one SHA and the build lands as a Preview.
  (README, "Four things that will make a green build serve the wrong thing".)
- [ ] **Node 22 in the Vercel project settings.** The app was built and tested
  on Node 22; there is no `engines` field or `.nvmrc` to pin it, so set it by
  hand.
- [ ] **A production build passes locally first:** `npm run typecheck`,
  `npm test`, `npm run build`. All three are green on the launch commit.
- [ ] **Custom domain attached, with the `www` / apex redirect chosen.** Pick
  one canonical host. `APP_ORIGIN` (below) and the GitHub `SITE_ORIGIN`
  variable must both be that exact host.
- [ ] **HSTS is on with `includeSubDomains`** (`next.config.js`). Every
  subdomain of the launch domain must be served over HTTPS from now on, or
  browsers will refuse it. Check nothing else lives on a plain-HTTP subdomain.
- [ ] **Memory fits the host.** Under fifty simultaneous runs the single Node
  process peaked at about 450 MB (`scripts/load/run.mjs`), most of it inline
  photos and candidate thumbnails in flight. A 512 MB container is too tight
  for that; give the app 1 GB on Railway, and know that Vercel functions default
  to 1 GB.
- [ ] **Function timeouts fit the plan.** Five routes declare `maxDuration`
  above 60s: analyze, curate, fit, accessories and wardrobe at 120, the sweep
  at 300. Vercel Hobby caps at 60 and silently kills the function; a closet
  run then ends with "Application error". Either Vercel Pro or Railway
  (`RAILWAY.md` is the runbook).

## 2. Environment variables

Set every one of these in the Vercel project for the **Production**
environment specifically. Preview and Development are separate scopes and a
value set in one does not reach the others.

| Variable | Without it | Where it comes from |
|---|---|---|
| `ANTHROPIC_API_KEY` | Every run fails at analysis | console.anthropic.com |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | No listings at all | developer.ebay.com, **production** keyset |
| `EBAY_ENV=production` | Sandbox listings, which are fake | you |
| `SERPAPI_KEY` | eBay only; the site still works | serpapi.com |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No saving, no accounts, no taste memory, **and every model route answers 429** (rate limiting fails closed) | Upstash console |
| `RESEND_API_KEY`, `MAIL_FROM` | No sign-in at all in production; the app stays anonymous | resend.com |
| `APP_ORIGIN` | Sign-in links refuse to mint | the canonical host, no trailing slash |
| `CRON_SECRET` | The sweep endpoint is closed | any long random string |
| `ADMIN_SECRET` | Falls back to `CRON_SECRET`; both unset closes the report | any long random string |
| `MEMBER_EMAILS` | Nobody is a member; everyone gets the free allowance | comma-separated addresses |

- [ ] **Every value above is set in Production**, then confirmed by hitting
  the site: a run completes, a sign-in email arrives, a closet saves.
- [ ] **Rotate any key that was ever pasted into a chat, an issue, a
  screenshot or a commit.** Treat a key that has been seen as burned.
- [ ] **`MAIL_FROM` is on a verified domain.** `onboarding@resend.dev` only
  delivers to the address that signed up for Resend. Verify the launch domain
  in Resend (TXT and MX records at the DNS host) and switch `MAIL_FROM` to it.
- [ ] **eBay keyset is production and the app is not in a limited state.**
  Sandbox keys return sandbox listings, which look real and are not.

## 3. Spend and quotas

Each closet run is roughly ten marketplace queries, up to seven model calls,
and, when the first pass comes back thin, one more query-writing call plus a
second search of up to six queries.

- [ ] **Anthropic: a monthly spend limit is set in the console** and an alert
  email is on. This is the one bill that scales with strangers.
- [ ] **SerpAPI: know the quota.** The free tier is a hundred searches a
  month. Each shop call uses up to four, and a second search is another shop
  call, so a run can cost eight. A hundred searches is somewhere between
  twelve and twenty-five runs. Either buy a tier that matches the launch or
  leave `SERPAPI_KEY` unset and launch eBay-only; the site handles both.
- [ ] **eBay Browse API daily call limit** covers the expected day. Each run
  is ten to sixteen calls against the keyset's daily cap; check the number in
  the developer portal against the traffic you expect.
- [ ] **Upstash plan** has headroom on commands and storage. The load
  simulation measures a full visit (quiz, run, save, votes, accessories,
  colognes, calibration, a judgement, a sizing lookup) at about 730 commands
  in 200 round trips, half of them the per-query records. On a plan metered
  per command, that is the number to multiply by expected visitors.
- [ ] **Per-address rate limits are what you want on launch day**
  (`lib/ratelimit.ts`): analyze 6 per hour, requery 6, shop 30, curate 40, judge 30, per
  network address. Six analyses an hour is generous for one person and tight
  for a dorm, an office or a mobile carrier sharing one address. Decide
  whether launch traffic will share addresses, and raise `analyze` before
  launch if so.
- [ ] **Free plan allowance** (`lib/plans.ts`): one closet, one keep, three
  judgements, no standing searches. Confirm that is the launch offer.

## 4. Security

The "Security" section of the README lists what is enforced and where. These
are the checks that the enforcement is actually live.

- [ ] **`/api/report/queries` answers 401 without the bearer token** on the
  production host, and 200 with it.
- [ ] **`/api/cron/sweep` answers 401 without `CRON_SECRET`** on production.
- [ ] **Sign-in link points at `APP_ORIGIN`**, not at whatever Host header the
  request carried. Request a link, read the email, confirm the domain.
- [ ] **Session cookie is `HttpOnly; Secure; SameSite=Lax`** in the browser's
  storage panel on the production domain. `Secure` cookies do not set over
  plain HTTP, which is why this must be checked on the real host.
- [ ] **A pasted listing URL to a private address is refused.** Paste
  `http://169.254.169.254/` into the "is this any good?" tool and confirm it
  is rejected, not fetched (`lib/safeFetch.ts`).
- [ ] **Response headers are present** on a production response: nosniff,
  `X-Frame-Options: DENY`, referrer policy, permissions policy, HSTS.
- [ ] **No Content-Security-Policy yet.** Known and deliberate; the marketing
  walk needs a report-only pass first. Not a blocker, but the next header to
  add after launch.
- [ ] **`npm audit --omit=dev` shows what you expect.** As of the launch
  commit: Next 14 carries advisories for Server Actions, rewrites, middleware
  and the Edge runtime, none of which this app uses, plus PostCSS ones that
  affect build-time only. The fix is Next 16, a major upgrade, deliberately
  not bundled into launch. Re-run the audit and re-read the list before you
  ship; a new advisory that *does* reach the app changes the answer.
- [ ] **Redis fails closed.** If Upstash is down, every model route answers
  429 rather than running unmetered. That is the intended trade; know that an
  Upstash outage looks like "the site is rate limiting everyone".
- [ ] **No secrets in the client bundle.** `grep -r "sk-ant" .next/static` and
  the same for the eBay secret returns nothing after a build.

## 5. Data

- [ ] **Know who owns the Upstash database.** If it was created through
  Vercel's Storage marketplace, deleting the Vercel project can delete the
  data. `RAILWAY.md` section 0 is the check.
- [ ] **Expiry is understood and acceptable.** Saved closets 90 days, renewed
  on read (`lib/closet.ts`). Sessions 30 days, renewed on use. Taste memory a
  year. Query yield records 90 days. Nothing is kept forever, and a closet
  nobody opens for three months is gone. If a kept closet should outlive
  that, the TTL is one constant.
- [ ] **Backups are on**, or accepted as off. Upstash offers daily backups on
  paid tiers; the free tier does not. Decide.
- [ ] **Eviction is off** on the Upstash database. With eviction on, a full
  database drops keys, and the first keys to go are somebody's account.
- [ ] **Photos are never stored.** Uploads are downscaled in the browser and
  sent to the model inline. Confirm nothing has changed that, because the
  privacy statement below promises it.

## 6. A full walk on the production host

Do this on the real domain, in a private window, on a phone and on a laptop.
The build passing means the code compiles; this is the check that the product
works with production keys.

- [ ] **First visit:** the onboarding quiz appears before the first
  generation, is answerable in under two minutes, and can be retaken.
- [ ] **A full run** with three to five real photos completes and hangs
  twelve pieces, or fewer with the "found less" state, in under two minutes.
  Read the profile it wrote; it should describe those photos.
- [ ] **A thin run** (upload one odd photo) triggers the second search: the
  progress copy changes to "Searching again with better terms", and the rail
  ends with more than it would have.
- [ ] **A run that fails partway** (turn off wifi mid-curation) ends in an
  error state that names what happened and offers a retry, not a blank page.
- [ ] **Voting** yes and no on pieces persists across a reload, and the memo
  on the next run quotes the right titles.
- [ ] **Sign-in:** request a link, receive it, open it, land signed in. Open
  the same link again; it is refused (single use). Request six links in an
  hour; the sixth is refused.
- [ ] **Password sign-in:** wrong password and unknown address take the same
  time and say the same thing.
- [ ] **Save a closet**, open the `/closet/CODE` link in a different browser,
  confirm it renders. Delete it from a browser that does not own it; 403.
- [ ] **Share card** renders with images; every image goes through
  `/api/image`, and a listing whose photo has gone shows a placeholder, not
  a broken tile.
- [ ] **Tools:** sizing saves and shows on the next run; "is this any good?"
  accepts a pasted eBay link and returns a verdict.
- [ ] **Standing scan** can be created by a member address and shows in the
  list. Then trigger the sweep by hand: Actions tab, "Sweep standing
  closets", "Run workflow". The run is green and a digest email arrives.
- [ ] **Accessories and colognes** open from a finished closet and answer in
  the closet's register. Colognes recommend; they do not search a
  marketplace.
- [ ] **Calibrate** runs its fifteen swipes with no model call and the next
  run reads differently.
- [ ] **Old links redirect:** `/tools`, `/sizing`, `/scan`, `/closets`,
  `/wardrobe`, `/discover` all land somewhere real.
- [ ] **The back button** works between the three closet tabs.
- [ ] **Dark mode** has no white-on-white anywhere: quiz, scan prompt, menu,
  share card.
- [ ] **Mobile Safari:** the file picker opens the camera roll, the hero does
  not jump when the address bar collapses, nothing scrolls sideways.
- [ ] **A nonsense URL** shows a 404 page with a way back, not the default.
- [ ] **The marketing walk** loads its 197 frames without stalling on a slow
  connection (throttle to Fast 3G in devtools once).
- [ ] **The query report** works against production:
  `SITE_ORIGIN=https://… ADMIN_SECRET=… node scripts/query-report.mjs`
  lists the run you just did.

## 7. Quality gates

- [ ] `npm test` green (378 tests at the launch commit).
- [ ] **The load simulation runs clean:** `npm run build` then
  `npx tsx scripts/load/run.mjs --users 50`. Zero non-2xx, every run
  saved, every query in the report. No key is real and nothing leaves the
  machine.
- [ ] `npm run typecheck` clean.
- [ ] **ESLint is not configured.** `npm run lint` opens Next's setup prompt instead of
  linting. Either answer it once (Strict) and commit the config, or accept that
  typecheck and tests are the only static gates.
- [ ] `npm run audit:contrast` passes against a fresh production build; it
  needs the server stopped and restarted after the build or it audits stale
  pages.
- [ ] **Lighthouse** on `/` and `/closet`, mobile: performance is not below
  the point where the walk feels broken, accessibility has no red items.
- [ ] **Asset weight is known.** The corridor frames, the three videos and
  the calibration images are the bulk of every first visit; know the total
  before a launch-day audience finds out on a phone plan.

## 8. What a public site is expected to have

None of these stop the code from running. All of them are missing at the
launch commit and every one is expected the moment a stranger, a search
engine or a chat app touches the URL.

- [ ] **Open Graph and Twitter card metadata.** `app/layout.tsx` sets a title
  and description and nothing else. A link pasted into iMessage, Slack or X
  shows no image and a bare domain. Add `openGraph` and `twitter` blocks with
  an image, or an `opengraph-image` file.
- [ ] **Icons.** `app/icon.svg` exists; there is no PNG fallback, no
  `apple-touch-icon`, no web manifest. Safari on iOS ignores SVG icons.
- [ ] **`robots.txt` and a sitemap.** Absent. Decide which routes are indexed:
  `/` yes, `/closet/[code]` probably not (they are someone's saved closet).
- [ ] **Canonical URL** on the marketing page, once the `www` decision is
  made.
- [ ] **A privacy page.** There is none. It needs to say, in plain words: photos
  are sent to Anthropic for analysis and not stored; a random identifier is
  set in a cookie to remember taste; an email address is stored only when you
  sign in; saved closets expire after ninety days; searches are sent to eBay
  and Google Shopping; nothing is sold. Link it from the footer and the sign-in
  form.
- [ ] **Terms of use**, even short ones: listings belong to their sellers,
  prices and availability are theirs, LevoZ Labs does not sell anything.
- [ ] **A way to contact you** on the site, and a way to delete an account on
  request. The privacy page should name both.
- [ ] **Affiliate disclosure**, if eBay Partner Network or any affiliate
  tracking is added to outbound links. Not at present; the check is that this
  stays true or the disclosure is added with it.
- [ ] **The company name and year** in a footer on the product routes, not
  only the marketing page.

## 9. Knowing when something breaks

The site has no error monitoring and no alerting at the launch commit. Vercel
keeps function logs briefly and does not page anyone.

- [ ] **Error reporting** wired in, or accepted as absent for launch. A
  free-tier Sentry with the Next.js SDK is a morning's work; at minimum, know
  where the Vercel function logs are and read them the first evening.
- [ ] **Uptime check** on `/` and on `GET /api/taste` (which answers 200 with
  `configured: true` when Redis is reachable), from any free monitor, to an
  address you read.
- [ ] **Spend alerts:** Anthropic (above), and Upstash's usage emails on.
- [ ] **The cost meter** works: `COST_LOG=1` on the deployment prints one JSON
  line per model call to the function log, and `scripts/cost-report.mjs`
  turns a log into a table. Run it once against a day of real traffic in the
  first week and compare it to what `npm run cost` predicts.
- [ ] **The query report** read once a week for the first month. It is the
  only evidence the recommendations are any good. Starved queries and
  wrong-register queries are listed at the bottom; they are the prompt work.
- [ ] **GitHub's scheduler** disables the sweep workflow after sixty days
  without a push. If standing scans go quiet, the Actions tab is the first
  place to look.

## 10. The runbook for the first bad day

Write these down somewhere you will find them at 11pm.

- **Anthropic is down or the key is over its limit:** every run fails at
  analysis with a 502 naming the model. Nothing to do but wait or raise the
  limit; the site's error copy already says to try again.
- **Upstash is down:** every model route answers 429 and saving fails. This
  is the fail-closed choice. If it lasts, the only way to keep the site
  usable is to change the rate limiter to fail open, which is a code change
  and a deliberate one.
- **eBay token errors:** the app token is minted from the keyset on demand;
  a keyset that eBay has disabled produces empty pools, which look like "found
  nothing". Check the developer portal before touching prompts.
- **SerpAPI quota exhausted:** results silently become eBay-only. Not an
  outage.
- **Rollback:** Vercel's deployments list, "Promote to Production" on the
  previous build. Under a minute.
- **A merged branch needs follow-up work:** restart the branch from `master`;
  never stack on merged history (the merged PR cannot track new work).

## 11. Launch day

- [ ] Section 6 done on the production host within the last day.
- [ ] Someone is watching the function log for the first hour.
- [ ] The rate limits in section 3 were reconsidered for how the first
  visitors will arrive (one shared address from an event or an office is the
  common surprise).
- [ ] The announcement link has been pasted into a chat app once to see what
  the preview looks like (section 8).
- [ ] The query report is run at the end of the day, and the starved queries
  are the first thing to work on tomorrow.
