# LevoZ — listings that learn

Third sibling of the Brain family (the LevoZ clipper, AdZ ads) — this one grades your marketplace listings on **real sales outcomes**, learns why items sell — and why the stuck ones don't — researches comps, and generates better listings.

## The main loop: photo → listing → eBay

1. **Photograph the item** (`/new`) — front and back. Claude's vision identifies what it is, the brand and size if the tags are legible, and any visible flaws. It says how confident it is and flags what it *couldn't* tell from the photos.
2. **It prices against comps** — if eBay is connected, it pulls comparable active listings from sellers with 98%+ feedback, clearly labelled as asking prices rather than sales, since eBay's sold-price API is a restricted Limited Release (see below). Your own playbook and sold history weigh in too.
3. **Review and approve** — the draft title, price, condition, and description are all editable. "Approve & list on eBay" publishes it as a real, buyable listing. There's a confirmation step, because that's a real listing real buyers can purchase.
4. **Track what it made** — record what you paid for an item (Listings → Cost tab) and `/analytics` shows profit, margin, your best and thinnest margins, and which categories and sourcing spots actually pay off.

## The learning loop

- **Set your niche** — what you sell, platforms, shipping, shop style.
- **Feed the Brain** — import listings with outcomes: the sold ones AND the ones that never moved. Both teach it. Pre-feed reference listings to bootstrap.
- **Analyze** — Claude contrasts sold vs stuck and writes a playbook (listing + pricing guidelines, avoid list), judges running experiments, proposes new ones.
- **Diagnose** — for anything not selling, it explains why, ranked by impact, and rewrites the title + description with a suggested price.
- **Close the loop** — record outcomes, re-analyze. Every cycle sharpens the next listing.

## Setup

```bash
cd sellz
cp .env.local.example .env.local
npm install
npx prisma migrate deploy # needs DATABASE_URL + DIRECT_URL
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) (the clipper is 3000, AdZ is 3001).

To get a signed-in seller and a working analysis you need `DATABASE_URL`,
`DIRECT_URL`, `AUTH_SECRET` and `ANTHROPIC_API_KEY`. Everything else — Google
sign-in, eBay, R2, Stripe — is optional and degrades with a clear message rather
than crashing, so you can add each one when you need it. `.env.local.example`
documents all of them.

`ANTHROPIC_API_KEY` is the *platform's* key: it powers grading, analysis, comps
research, diagnosis and generation for every seller. Sellers never supply one,
which is what the plan limits in `lib/usage.ts` are there to bound.

## Architecture

Multi-tenant SaaS. Every row belongs to a `User`, and every data function in
`lib/store.ts` takes a `userId` and filters on it, so an id belonging to another
seller resolves to nothing rather than to their row.

| Concern | Choice |
|---|---|
| Database | Postgres (Supabase) via Prisma — `prisma/schema.prisma` |
| Auth | NextAuth v5, Google + email/password — `lib/auth.ts`, split from the edge-safe `auth.config.ts` for middleware |
| Photos | Cloudflare R2, keys namespaced per seller — `lib/photos.ts` |
| Payments | Stripe Checkout + billing portal — `app/api/stripe/*` |
| Plan limits | `lib/usage.ts`, always enforced from the `User` row, never from the session token |
| Hosting | Any long-lived Node host. Not serverless — photo analysis runs up to 600s |

Plans: Free (10 analyses/month), Pro $29 (100/month, proposals + automation),
Business $79 (unlimited, 3 eBay accounts).

## eBay auto-sync (optional)

Connecting an eBay Developer app lets the Brain page pull each listing's views and sold price/date automatically instead of you typing them into the Outcome tab.

1. In the [eBay Developer Portal](https://developer.ebay.com/), grab your app's **App ID (Client ID)** and **Cert ID (Client Secret)**.
2. Under your app's **User Tokens** settings, create a **RuName**. Set its "Your auth accepted URL" to `https://<your-deployed-domain>/api/ebay/callback` — this has to be a real `https://` address; eBay won't redirect to `localhost`. If you're testing locally, tunnel your dev server with something like [ngrok](https://ngrok.com) and use that tunnel's URL here instead.
3. Add to `.env.local` (and to the same names in your host's environment variables):
   ```
   EBAY_CLIENT_ID=...
   EBAY_CLIENT_SECRET=...
   EBAY_RUNAME=...
   EBAY_ENV=production   # or "sandbox" while testing
   ```
4. On the Brain page, click **Connect eBay account**, log in, and grant access. Then on any eBay listing, paste its item ID (from the listing's URL) into the Outcome tab and hit **Sync from eBay**.

### Syncing your live listings

**Dashboard → Sync from eBay** pulls every listing on the connected account (active, sold, and unsold) and reconciles them into the local store, matching on eBay item id so repeat syncs update rather than duplicate. Anything you added locally (cost basis, Brain score, comps, diagnosis) is preserved.

This uses the legacy Trading API `GetMyeBaySelling`, because the modern Inventory API's `getOffers` only sees listings created through that same API and would miss anything you listed in the eBay app or web UI. eBay has been trimming Trading API fields, so it is isolated in one function (`fetchAllEbayListings`) to make it swappable. Currently paged at 200 per list.

Notes on what this can and can't do: views come from eBay's Analytics API, sold price/date from the Fulfillment (orders) API. The single-listing "Sync from eBay" on a card checks only your most recent 50 orders, so it may miss a very old sale; the dashboard sync does not have that limit. Watch count comes back on some Trading responses and not others, and is left untouched rather than zeroed when eBay omits it.

### Comps from the photo

When eBay is connected, comps research sends the item photo to eBay's `searchByImage` alongside the keyword search, so matches come from the picture rather than only from a guessed phrase. Those results are then fed back into the identification pass: the titles other sellers used for visually identical items are much stronger evidence of what something is than asking the model to squint at the same photo again. The review screen shows how many comps were matched visually.

### Publishing listings to eBay

The "Approve & list on eBay" button uses the Inventory API, which has requirements beyond just connecting your account:

- **Business policies are mandatory.** eBay refuses to publish an offer unless your seller account has a payment policy, a return policy, a shipping (fulfillment) policy, and an inventory location. Set them in My eBay → Account → Business Policies. The review screen checks this up front and tells you exactly what's missing rather than failing at the last step.
- **Photos must be publicly reachable.** eBay fetches images by URL, so uploaded photos are served from `/api/photos/[id]` on your deployed site. This means publishing works from the deployed app, not from `localhost`. Set `PUBLIC_SITE_URL` if the origin the app sees isn't the public one.
- **Sold-price comps are not available on a normal keyset.** eBay's Marketplace Insights API (actual sold prices) is a *Limited Release* that eBay approves case by case, and their docs state it is closed to new users. A standard developer account does not have it, and there is no self-serve way to turn it on. Comps therefore use active listings from sellers with 98%+ feedback, which are asking prices, and the UI says so rather than implying they are sales. If you are ever granted access, set `EBAY_MARKETPLACE_INSIGHTS=true`; note it also needs a client-credentials app token scoped to `buy.marketplace.insights`, which is separate from the user token everything else uses.
- **Scopes changed.** Publishing needs `sell.inventory` and `sell.account.readonly`, so if you connected eBay before this feature existed, disconnect and reconnect to re-consent with the new scopes.

## Deploying

See **[DEPLOY.md](./DEPLOY.md)** for the full runbook — Supabase, Google OAuth,
R2, Stripe, eBay, custom domain, and a post-deploy checklist.

The one thing worth knowing before you start: this repository contains three
Next.js apps (the clipper at the repo root, `adz/`, and `sellz/`). A host pointed
at the repository root will build and serve the wrong one, successfully. Set the
service's **root directory to `sellz`**.

Scheduled jobs — publish, relist, best offers, research, usage reset — are
host-agnostic HTTP endpoints guarded by `CRON_SECRET`. See [CRON.md](./CRON.md).

## Notes

- Each seller's data is isolated at the query level, and their photos are stored under a per-seller key prefix in R2.
- The generator/diagnoser never invents brands, sizes, measurements, or condition details you didn't state.
- Comps research depends on what web search can reach; sold-price data is patchy for some categories — the paste-your-own-comps field covers the gap (checking eBay's sold filter yourself takes 30 seconds and is the best data).
