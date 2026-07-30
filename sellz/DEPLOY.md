# Deploying LevoZ

The app is an ordinary Next.js server. It is not serverless-compatible: the
photo analysis route runs for up to 600 seconds, which is well past every
serverless platform's ceiling. Anything that runs a long-lived Node process
works; these instructions use Railway.

Work through the sections in order. Each one produces environment variables the
next one needs, and the app boots without most of them — features degrade with a
clear message rather than crashing — so it is fine to deploy early and fill the
rest in.

---

## 0. The one thing that trips up every first deploy

**This repository contains three separate Next.js apps:** the clip tool at the
repo root, `adz/`, and `sellz/` (this one). A host pointed at the repository root
will build the root app and serve it — the deploy succeeds, and none of it is
LevoZ.

So when you create the Railway service, set:

> **Settings → Source → Root Directory: `sellz`**

Everything else in this file assumes that is set. `sellz/railway.json` is only
read once the root directory points at `sellz`.

---

## 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com). Save the database
   password it shows you — it is not recoverable, only resettable.
2. **Project Settings → Database → Connection string**. Take two URLs:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`. Append
     `?pgbouncer=true`. This is what the app uses at runtime.
   - **Session pooler / direct** (port `5432`) → `DIRECT_URL`. Prisma needs a
     non-pooled connection to change the schema; schema pushes fail over
     pgbouncer.
3. Create the tables:

   ```sh
   cd sellz
   npm install
   DATABASE_URL=... DIRECT_URL=... npx prisma db push
   ```

There are no migration files — the schema is applied with `prisma db push`.
`railway.json` also runs it as a pre-deploy step, so later schema changes land
with the deploy that contains them. It runs **without** `--accept-data-loss`, so
a change that would drop a column fails the deploy instead of quietly
destroying data. If that happens, resolve it by hand rather than adding the
flag.

## 2. Auth

```sh
openssl rand -base64 32
```

Set that as `AUTH_SECRET`. It signs session cookies **and** the eBay OAuth state
parameter, so eBay cannot connect without it.

Set `NEXTAUTH_URL` to the app's public origin (`https://levoz.app`). It must be
the origin users actually visit, or the OAuth redirect bounces back to the wrong
host.

### Google sign-in (optional)

Email/password works without this, and the sign-in page hides the Google button
when it is not configured — so you can ship first and add Google later.

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs &
   Services → Credentials → Create OAuth client ID → Web application**.
2. **Authorised redirect URI** — exactly, including the path:

   ```
   https://<your-domain>/api/auth/callback/google
   ```

3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (Auth.js's own convention) are read as a
fallback; either pair works, so no deploy ends up with credentials set under a
name nothing reads.

## 3. AI

Set `ANTHROPIC_API_KEY` to the **platform's** key from
[console.anthropic.com](https://console.anthropic.com). Sellers never supply a
key — the cost is carried by the subscription, which is why the plan limits in
`lib/usage.ts` exist. Put a monthly spend cap on the key in the Anthropic
console; the plan limits bound per-seller use, not a bug or an abusive account.

## 4. Photos (Cloudflare R2)

R2 rather than S3 because eBay re-fetches listing images constantly and R2
charges nothing for egress.

1. Cloudflare dashboard → **R2 → Create bucket**, e.g. `levoz-photos`.
2. **Keep it private.** Images are served through `/api/photos/[id]`, which
   resolves the owning seller server-side.
3. **R2 → Manage API Tokens → Create API token**, Object Read & Write.
4. Set `R2_ENDPOINT` (`https://<account_id>.r2.cloudflarestorage.com`),
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

## 5. Payments (Stripe)

1. **Products → Add product**, twice, each with a **recurring monthly** price:
   - Pro — $29/month
   - Business — $79/month
2. Copy each *price* id (`price_…`, not the `prod_…` id) into
   `STRIPE_PRO_PRICE_ID` and `STRIPE_BUSINESS_PRICE_ID`. Checkout takes a plan
   name from the browser and looks the price up from these server-side, so a
   wrong id here shows as "that plan isn't configured" rather than as a
   mischarge.
3. Set `STRIPE_SECRET_KEY` from **Developers → API keys**.
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Enable the customer portal at **Settings → Billing → Customer portal**, or
   the "Manage subscription" button on the billing page has nothing to open.

Test with `stripe listen --forward-to localhost:3002/api/stripe/webhook` before
going live. Until the webhook is delivering, a successful payment will not
upgrade the account — the webhook is the only thing that changes a plan.

## 6. eBay

1. Create production keys at
   [developer.ebay.com](https://developer.ebay.com/my/keys).
2. Set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENV=production`.
3. **Add a redirect URI (RuName)**, and set its *auth accepted URL* to:

   ```
   https://<your-domain>/api/ebay/callback
   ```

   Set `EBAY_RUNAME` to the **RuName string**, not that URL. This is the single
   most common eBay setup mistake.
4. `EBAY_MARKETPLACE_INSIGHTS=true` is opt-in and only works if eBay approved
   your keyset for the Limited Release Marketplace Insights API. Without it,
   comps fall back to asking prices instead of sold prices — the app says so in
   the UI rather than pretending otherwise.

One RuName serves every tenant, so the callback cannot tell sellers apart by
URL. The tenant travels in an HMAC-signed `state` parameter instead
(`lib/oauthState.ts`), which is why `AUTH_SECRET` must be set before anyone can
connect eBay.

## 6b. Email digest (optional)

Only used for the nightly summary of changes the Brain applied on its own.
Skip it and everything else still works.

1. Create an account at [resend.com](https://resend.com) and verify a domain
   under **Domains** — Resend rejects sends from unverified domains, so this
   step is not optional if you want the email to arrive.
2. **API Keys → Create API Key**, with send permission.
3. Set `RESEND_API_KEY`, and `EMAIL_FROM` to an address on that verified
   domain (e.g. `LevoZ <listings@levoz.app>`).

## 7. App origin

Set `PUBLIC_SITE_URL` to the public origin (`https://levoz.app`).

This one matters more than it looks. eBay fetches listing photos from URLs built
on it, so if it is wrong or missing, listings publish successfully **with no
images**. When it is unset the app falls back to `RAILWAY_PUBLIC_DOMAIN`, which
Railway injects automatically — enough for a fresh deploy to work before a
custom domain exists. Set it explicitly once you have a domain.

## 8. Deploy

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub
   repo**.
2. **Set Root Directory to `sellz`** (section 0).
3. Paste the environment variables into **Variables**. Do not set `PORT` —
   Railway sets it, and the start script reads it.
4. Deploy. Railway builds with Nixpacks, runs `prisma db push` as a pre-deploy
   step, starts the server, and waits for `/api/health` before shifting traffic.
5. **Settings → Networking → Custom Domain**, then point your DNS at it.
6. Once the domain is live, go back and update: `NEXTAUTH_URL`,
   `PUBLIC_SITE_URL`, the Google redirect URI, the Stripe webhook URL, and the
   eBay RuName auth accepted URL. Every one of them is host-specific and fails
   quietly if it still points at the old hostname.

`/api/health` is a liveness check that deliberately does not touch Postgres —
tying the healthcheck to the database means one Supabase blip rolls back a good
deploy. Use `/api/health?deep=1` to check the database by hand.

## 9. Scheduled jobs

Set `CRON_SECRET` to any long random string, then follow [CRON.md](./CRON.md) to
create the five scheduled jobs.

Do not skip this. The cron routes **fail closed** when `CRON_SECRET` is unset —
they act on every tenant, so an unguarded one is far worse than it was for a
single self-hosted user. Without the jobs, scheduled publishing, auto-relist,
best-offer acceptance and nightly research silently never run.

---

## Post-deploy checklist

Walk the whole path once on the real domain:

- [ ] `/` and `/pricing` load signed out; `/dashboard` redirects to `/login`
- [ ] `GET /api/health` returns `{"ok":true}`; `?deep=1` reports `database: up`
- [ ] Sign up with email/password, then with Google
- [ ] A new account lands on `/onboarding` and the wizard saves
- [ ] Connect eBay — consent, callback, and `/api/ebay/status` says connected
- [ ] Upload photos on `/new` and run an analysis; a draft comes back
- [ ] The draft's photos load at `/api/photos/<id>` **signed out** (this is what
      eBay does)
- [ ] Publish to eBay, and confirm on eBay that the images are attached
- [ ] `/settings/billing` shows the plan and usage
- [ ] Subscribe to Pro with a [test card](https://stripe.com/docs/testing), and
      confirm the webhook flipped the plan
- [ ] Burn the free allowance and confirm analysis returns 402 with an upgrade
      prompt
- [ ] `curl -X POST <domain>/api/cron/publish` with no header returns 401, and
      with `Authorization: Bearer $CRON_SECRET` returns 200
- [ ] Create a second account and confirm it sees none of the first's listings

That last one is the check worth doing by hand. Every store function filters on
`userId`, but tenant isolation is the property this whole conversion exists to
provide, and it is the one bug users would never report politely.
