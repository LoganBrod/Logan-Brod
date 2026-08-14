# Moving to Railway

The decision is made; this is the runbook. The reasoning that led here is at the
bottom, because you'll want it again the first time something is slow.

Everything in the repo that this needs is already committed: `railway.json`,
a `start:railway` script that binds the port Railway hands you, and
`scripts/sweep-once.mjs` for the scheduled run. Nothing below asks you to write
code.

---

## 0. Before you touch anything: check where Redis lives

**This is the step that can lose data, so it goes first.**

Every saved closet, every account, and everyone's taste history lives in Upstash.
If that database was created through **Vercel → Storage → Marketplace**, then
Vercel owns the billing relationship, and deleting the Vercel project later can
take the database with it.

Open [console.upstash.com](https://console.upstash.com) and sign in with the
account you'd expect to own it.

- **The database is listed there** — you're fine. It's a normal Upstash database
  and Vercel was only injecting the credentials. Copy
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from its dashboard.
- **It isn't listed** — it's a Vercel-managed marketplace resource. Do not delete
  the Vercel project at the end of this. Either leave that project alive purely
  to hold the database, or create a fresh Upstash database and copy the data over
  before you decommission anything.

Either way: **keep the Vercel project until a closet has been saved and re-opened
on Railway.** Deleting it is the one step with no undo.

---

## 1. Create the service

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub
   repo** → `LoganBrod/Logan-Brod`.
2. It will start building and it will fail. That's expected — it doesn't know the
   app is in a subdirectory yet.
3. Open the service → **Settings** → **Source** → set **Root Directory** to
   `site`.

That third step is the one that cost hours on Vercel: five projects were pointed
at a directory that didn't exist and every build died at the clone. Set it now,
before anything else.

With the root directory set, Railway reads `site/railway.json` and gets its build
and start commands from there. You shouldn't have to type either by hand.

---

## 2. Environment variables

**Settings → Variables → Raw Editor** takes all of them pasted at once.

Copy the values out of the Vercel project's environment variables so nothing is
retyped. Required for the app to work at all:

```
ANTHROPIC_API_KEY=
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_ENV=production
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
```

Optional, each unlocking one thing:

```
SERPAPI_KEY=          # Google Shopping as a second source; eBay-only without it
RESEND_API_KEY=       # sign-in emails; no accounts in production without it
MAIL_FROM=            # e.g. Clozet <hello@levozlabs.com>
MEMBER_EMAILS=        # comma-separated, membership without paying
```

Do **not** set `PORT`. Railway injects it and `npm run start:railway` reads it.
Setting it yourself is how you get a service that builds fine and never passes
its health check.

---

## 3. First deploy, and what to actually check

Railway gives you a `*.up.railway.app` URL under **Settings → Networking**. Press
**Generate Domain** if there isn't one.

Check these in order. Each failure points somewhere different:

| Check | If it fails |
|---|---|
| `/` loads and the corridor animates | Build or static assets — look at the deploy log |
| `/closet` loads the form | The app is up; this is routing |
| Build a closet with 2–3 photos | Model keys. Watch the log for a 401 from Anthropic or eBay |
| The closet gets a code, and `/closet/<code>` opens it | Redis. Almost always a wrong `UPSTASH_*` value |

**The one to pay attention to is the third**, because it's the reason for the
whole move: curation fetches sixteen product images and *then* makes a vision
call, which on Vercel Hobby's 60-second ceiling was finishing some of the time
and being killed the rest. On Railway there is no ceiling. If a closet that used
to fail now takes ninety seconds and works, the migration has already paid off.

---

## 4. The cron

The sweep runs everyone's standing searches twice a day. **It already works** —
`.github/workflows/sweep.yml` has been doing it on GitHub Actions since Vercel
Hobby's one-cron-a-day limit made `vercel.json` untenable.

So there are two honest options.

### Option A — change one variable (recommended)

GitHub Actions is already running it, it's free, and it doesn't bill you for a
second Railway service.

**GitHub → repo → Settings → Secrets and variables → Actions → Variables** →
edit `SITE_ORIGIN` → set it to the new origin (the Railway URL now, your domain
after step 5).

`CRON_SECRET` is already set as an Actions *secret* and doesn't change — but it
must match the `CRON_SECRET` you put in Railway, or every run 401s.

Then **Actions → Sweep → Run workflow** to fire it once by hand and confirm.

### Option B — run it on Railway

If you'd rather have everything in one place:

1. In the same project: **New** → **GitHub Repo** → the same repo. This is a
   second *service* sharing the deployment.
2. **Settings → Source → Root Directory** → `site`.
3. **Settings → Deploy → Start Command** → `npm run sweep:once`
4. **Settings → Deploy → Cron Schedule** → `0 8,20 * * *`
5. Give it two variables: `CRON_SECRET` (same value as the web service) and
   `SITE_ORIGIN` (the public URL).

A Railway cron service starts, runs, and must **exit** — which is exactly what
`sweep-once.mjs` does, with a non-zero exit code on failure so a bad run shows as
failed rather than silently green. It does not retry a 401, because a wrong
secret is never worth retrying.

Do **not** put a cron schedule on the web service. It would restart your site
twice a day.

If you take Option B, disable the GitHub workflow (**Actions → Sweep → ⋯ →
Disable workflow**) so the sweep doesn't run twice.

---

## 5. Move the domain — last

Only once a closet has been built *and* re-opened by code on the Railway URL.
DNS is the slowest thing here to undo.

1. Railway → **Settings → Networking → Custom Domain** → `levozlabs.com`, and
   again for `www.levozlabs.com`. Railway shows you the CNAME target.
2. At your DNS host, change the records from Vercel's to Railway's.
3. Wait for the certificate to go green in Railway before testing.
4. Update `SITE_ORIGIN` in whichever scheduler you chose to the real domain.
5. If `MAIL_FROM` uses your domain, nothing changes — Resend verifies the domain,
   not the host.

Propagation is usually minutes and occasionally hours. Until it finishes, some
people get Vercel and some get Railway, which is fine because both are serving
the same app from the same database.

---

## 6. After the cutover

- **Delete the `maxDuration` exports** — seven lines across seven routes in
  `app/api/`. They're inert off Vercel, but leaving them implies a ceiling that no
  longer exists. Left in place deliberately until now, so the Vercel deploy keeps
  working while both are live.
- **Put Cloudflare in front**, free tier. `public/frames/` is 197 JPEGs the
  marketing page scrubs through, and they now come from one region rather than an
  edge network. Cloudflare caches `/_next/static` and `/frames` happily. The phone
  set added since is only 66 files at 0.85MB, so this matters less than it did —
  but on desktop it's still 6.7MB from a single region.
- **Only then** consider the Vercel project, and re-read step 0 first.

---

## Why this, and what it costs

**Why.** Vercel Hobby caps a function at 60 seconds. Curation fetches sixteen
product photos server-side and then starts a vision call, landing close enough to
the ceiling that runs fail unpredictably — and the failure arrives *after* the
wait, which is the worst shape a failure can have. Railway runs a persistent Node
process with no per-request ceiling.

**What it costs.** Railway Hobby is $5/mo including $5 of usage, billed by
consumption, and a persistent server bills while idle in a way serverless doesn't.
Vercel Pro is a flat $20/mo and would need no migration at all. The gap is real
but small — this is a decision about the 60-second ceiling, not about price.

**What it doesn't touch.** Very little here is Vercel-specific, which is what
makes it cheap: Redis is Upstash over plain HTTPS, email is Resend over HTTPS,
photos are never stored anywhere (they're downscaled in the browser and sent to
the model inline), and the cron has been external since it was written. It's a
Next.js app and eleven environment variables.
