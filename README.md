# Sports Card Tools

A small Next.js app with a few independent tools:

- **`/`** — Hub linking to the tools below.
- **`/cards`** — Sports card deal finder: scans active eBay listings and flags ones priced
  at or below a configurable fraction (default 80%) of the market comp price.
- **`/buzz`** — Player social buzz: recent Reddit mentions for a player with basic
  sentiment scoring.
- **`/nba`** — NBA improving players vs market: compares a player's last-10-games scoring
  average to their season average, alongside a snapshot card market price.
- **`/alerts`** — Watch rules evaluated by a daily Vercel Cron job, with Discord
  notifications when one trips.

## Features

### Sports card deal finder (`/cards`)
- Active listings via the **eBay Browse API** (OAuth2 client-credentials)
- Market comp price averaged from up to two sources:
  - **eBay Marketplace Insights API** (90-day sold comps) — this API requires eBay to
    separately approve your application for `buy.marketplace.insights` access (limited
    release, applied for on top of standard Browse API access). If your app isn't
    entitled, this source is silently skipped (calls degrade to `null` on 403).
  - **PriceCharting API** — general market pricing.
- A listing is a "deal" when its total price (item + shipping) is at or below the chosen
  threshold (e.g. 0.8×) of the averaged comp price.
- Requires `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and/or `PRICECHARTING_API_TOKEN`. At
  least one comp source (PriceCharting is the easier one to get approved for) must be
  configured or scans return "no comps found".

### Player social buzz (`/buzz`)
- Uses **Reddit's official search API** for recent mentions of a player, scored with a
  small built-in positive/negative word lexicon (no external NLP API needed).
- Twitter/X and Instagram are **not** scraped — both forbid automated access to their
  content in their terms of service, and their official APIs require a paid tier this repo
  doesn't assume you have. `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` are optional; without
  them the tool falls back to Reddit's public (more rate-limited) search endpoint.

### NBA improving players vs market (`/nba`)
- Uses the **balldontlie API** to compare a player's last 10 games PPG to their season
  average, showing a real, computed performance trend.
- Pairs that trend with a **current snapshot** market price for the player's cards (via the
  same comp sources as `/cards`). This is a point-in-time price, not a tracked price history
  — the app has no database to store prices over time.
- Requires `BALLDONTLIE_API_KEY` (free signup). The free tier is rate-limited, so the page
  takes an explicit, comma-separated list of player names (max 10) rather than scanning the
  whole league.

### Alerts (`/alerts`)
- Two rule types (the engine is built to take more later, e.g. deal alerts and
  market-dip alerts):
  - **Buzz spike** — fires when today's Reddit mention count for a player is at least
    `spikePct`% above the trailing daily average (needs 3 days of baseline history first,
    minimum 5 mentions, 48h cooldown between fires).
  - **NBA breakout** — fires when a player's last-10-games PPG minus season PPG crosses
    your threshold, on the upward transition only (a sustained hot streak pings once).
- **Storage**: Upstash Redis. Add it in the Vercel dashboard (Storage → Marketplace →
  Upstash, free tier) — the `UPSTASH_REDIS_REST_*` env vars are injected automatically.
- **Notifications**: a Discord webhook (`DISCORD_WEBHOOK_URL`). Create one in any server
  you own: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
- **Schedule**: `vercel.json` registers a cron hitting `/api/alerts/check` daily at 13:00
  UTC. Vercel's Hobby plan allows at most one run per day; on Pro you can tighten the
  schedule. Cron only runs on the production deployment. Set `CRON_SECRET` to protect the
  endpoint (Vercel sends it automatically). You can also trigger a check manually from the
  `/alerts` page.

## Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done).
2. Go to [vercel.com](https://vercel.com) → New Project → import this repo.
3. Add the environment variables you need from `.env.local.example`.
4. Deploy.

## Local development

```bash
cp .env.local.example .env.local
# Edit .env.local and add the tokens for whichever tools you want to use
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
