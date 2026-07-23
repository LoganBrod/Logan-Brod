# Logan Brod Tools

A small Next.js app with a few independent tools:

- **`/`** — Roobet Wager Leaderboard for the **lmb1** affiliate code.
- **`/cards`** — Sports card deal finder: scans active eBay listings and flags ones priced
  at or below a configurable fraction (default 80%) of the market comp price.
- **`/buzz`** — Player social buzz: recent Reddit mentions for a player with basic
  sentiment scoring.
- **`/nba`** — NBA improving players vs market: compares a player's last-10-games scoring
  average to their season average, alongside a snapshot card market price.

## Features

### Roobet leaderboard
- Live leaderboard ranked by total wagered amount
- Podium-style top 3 with gold / silver / bronze styling
- Countdown timer to contest end
- Auto-refreshes every 5 minutes
- Server-side API proxy keeps your API token secure

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

## Affiliate link

Sign up at [roobet.com/?ref=lmb1](https://roobet.com/?ref=lmb1) to participate in the contest.
