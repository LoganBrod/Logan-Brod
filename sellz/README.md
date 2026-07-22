# LevoZ — listings that learn

Third sibling of the Brain family (the LevoZ clipper, AdZ ads) — this one grades your marketplace listings on **real sales outcomes**, learns why items sell — and why the stuck ones don't — researches comps, and generates better listings.

## The loop

1. **Set your niche** — what you sell, platforms, shipping, shop style.
2. **Feed the Brain** — import listings with outcomes: the sold ones (sale price, days-to-sell, views/watchers) AND the ones that never moved. Both teach it. Pre-feed reference listings from your niche to bootstrap.
3. **Analyze** — Claude contrasts sold vs stuck: title keywords, pricing vs comps, photos, condition framing. Writes a playbook (listing + pricing guidelines, avoid list), judges running experiments, proposes new ones.
4. **Research comps** — per listing, the Brain searches the web for what comparable items actually sold for and stores a price range + demand notes. Paste your own comps when you have better data.
5. **Diagnose** — for anything not selling: "Why isn't it selling?" contrasts it against your sold listings and comps, explains the problem ranked by impact, and rewrites the title + description with a suggested price.
6. **Generate** — describe an item; get platform-aware drafts (eBay keyword titles vs Depop casual + hashtags) with price, tags, and a photo checklist — Brain-scored and rotating through experiments.
7. **Close the loop** — record outcomes, re-analyze. Every cycle sharpens the next listing.

## Setup

```bash
cd sellz
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) (the clipper is 3000, AdZ is 3001).

Only `ANTHROPIC_API_KEY` is needed — it powers grading, analysis, comps research (via Claude's web search), diagnosis, and generation.

## eBay auto-sync (optional)

Connecting an eBay Developer app lets the Brain page pull each listing's views and sold price/date automatically instead of you typing them into the Outcome tab.

1. In the [eBay Developer Portal](https://developer.ebay.com/), grab your app's **App ID (Client ID)** and **Cert ID (Client Secret)**.
2. Under your app's **User Tokens** settings, create a **RuName**. Set its "Your auth accepted URL" to `https://<your-deployed-domain>/api/ebay/callback` — this has to be a real `https://` address; eBay won't redirect to `localhost`. If you're testing locally, tunnel your dev server with something like [ngrok](https://ngrok.com) and use that tunnel's URL here instead.
3. Add to `.env.local` (and to the same names in your host's environment variables, e.g. Netlify's site settings):
   ```
   EBAY_CLIENT_ID=...
   EBAY_CLIENT_SECRET=...
   EBAY_RUNAME=...
   EBAY_ENV=production   # or "sandbox" while testing
   ```
4. On the Brain page, click **Connect eBay account**, log in, and grant access. Then on any eBay listing, paste its item ID (from the listing's URL) into the Outcome tab and hit **Sync from eBay**.

Notes on what this can and can't do: views come from eBay's Analytics API, sold price/date from the Fulfillment (orders) API — both scoped read-only to your own account. Watcher count isn't pulled automatically (eBay doesn't expose it cleanly through these APIs) and stays manual. The order lookup only checks your most recent 50 orders, so it may miss a very old sale.

## Deploying (Netlify)

This repo includes `netlify.toml` wired for Netlify's official Next.js runtime. One thing to know: local dev stores data in `./data/store.json` on disk, but Netlify's functions have no persistent disk, so the deployed app automatically switches to [Netlify Blobs](https://docs.netlify.com/blobs/overview/) instead (see `lib/db.ts`) — no setup needed beyond deploying normally, Blobs works out of the box on Netlify.

## Notes

- Local data lives in `./data` (gitignored) — your sales numbers stay on your machine. On Netlify it lives in Netlify Blobs instead (see above).
- The generator/diagnoser never invents brands, sizes, measurements, or condition details you didn't state.
- Comps research depends on what web search can reach; sold-price data is patchy for some categories — the paste-your-own-comps field covers the gap (checking eBay's sold filter yourself takes 30 seconds and is the best data).
