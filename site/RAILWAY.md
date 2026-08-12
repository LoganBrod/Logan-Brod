# Moving to Railway

Not done, and not necessary yet. This is written so the decision can be made on
evidence rather than re-derived under pressure.

## Why you would

Vercel's Hobby plan caps a serverless function at **60 seconds**. Four routes ask
for more:

| Route | Declared | Why it's long |
|---|---|---|
| `/api/style/analyze` | 120s | one vision pass over everything you uploaded |
| `/api/style/curate` | 120s | fetches 16 product photos, then a vision call — ×3 in parallel |
| `/api/wardrobe` | 120s | outfits assembled from the pieces you own |
| `/api/cron/sweep` | 300s | several people's watches, each a search plus a vision pass |

Curation is the one that decides this. It fetches sixteen images server-side and
*then* starts the model call, which lands close enough to 60s that some runs
finish and some are killed. A closet that builds four times out of five is worse
than one that reliably takes longer, because the failure arrives after the wait.

Railway runs a persistent Node process. There is no per-request ceiling, so every
`maxDuration` line above gets deleted rather than tuned.

## Why you might not

- **You lose the CDN.** `/public/frames/` is 197 JPEGs that the marketing page
  scrubs through on scroll. On Vercel they come from the edge; on Railway they
  come from one region. Put Cloudflare in front — free, and it caches
  `/_next/static` and `/frames` happily — and this mostly goes away. Don't skip
  it.
- **It is a migration**, and the deployment is currently broken for an unrelated
  reason (six Vercel projects on one repo, five pointing at a `style/` directory
  that no longer exists). Moving platforms while something else is broken means
  you can't tell which change did what. Get a green build first.
- **Vercel Pro is $20/mo and needs no code change at all.** If the time cost of
  migrating matters more than $15/mo, that's the answer and it's not a bad one.

## What the app actually depends on

Very little that is Vercel-specific, which is what makes this cheap:

- **Redis** is Upstash over plain HTTPS REST (`UPSTASH_REDIS_REST_URL` / `_TOKEN`).
  Works anywhere. Upstash bills the database, not the host.
- **Photo storage** doesn't exist — images are downscaled in the browser and sent
  to the model inline. Vercel Blob was removed a long time ago.
- **Cron** is already external, see `.github/workflows/sweep.yml`. Nothing to move.
- **Email** is Resend over HTTPS.

So it's the Next.js app and thirteen environment variables.

## Steps

1. **Build a standalone server.** In `next.config.js`:

   ```js
   output: "standalone",
   ```

   This emits `.next/standalone/server.js` with only the dependencies it
   actually uses. Harmless on Vercel, which ignores it — so it can be committed
   before any decision is made.

2. **Add `railway.json`** at the repo root:

   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "cd site && npm ci && npm run build"
     },
     "deploy": {
       "startCommand": "cd site && node .next/standalone/server.js",
       "healthcheckPath": "/",
       "restartPolicyType": "ON_FAILURE"
     }
   }
   ```

   Standalone output does not copy `public/` or `.next/static`. Either add
   `cp -r public .next/static .next/standalone/` to the build command, or drop
   `output: "standalone"` and start with `npm start` — slower to boot, one less
   thing to get wrong. Start with `npm start`; optimise later if boot time ever
   matters.

3. **Set the environment variables.** All thirteen from `.env.local.example`,
   plus `PORT` — Railway injects it and the server must bind to it, not to 3000.
   `npm start` already respects `PORT`.

4. **Point `SITE_ORIGIN`** (the GitHub Actions repository variable) at the new
   origin, so the sweep follows. The `CRON_SECRET` secret is unchanged.

5. **Move the domain last**, once the Railway URL serves both `/` and `/closet`
   correctly and a closet builds end to end. DNS is the step that's slow to undo.

6. **Delete the `maxDuration` exports** — four lines across four routes. They're
   inert off Vercel, but leaving them implies a constraint that no longer exists.

## Cost, honestly

Railway Hobby is $5/mo including $5 of usage; an app this size is unlikely to
exceed it by much, but it is usage-billed and a persistent server bills while
idle in a way serverless does not. Vercel Pro is a flat $20. The gap is real but
small — pick on the 60-second ceiling, not on the price.

## The order that matters

Fix the Vercel projects → confirm a green production build → watch whether
curation actually gets killed at 60s. If it does, come back here. If it doesn't,
the only thing Hobby was costing you was the cron, and that's already solved.
