# Roobet Wager Leaderboard

A real-time wager leaderboard for the **lmb1** Roobet affiliate code. Pulls data from the Roobet affiliate API and displays ranked players by total wager amount, with a live countdown to the contest end date (July 16, 2026).

## Features

- **Deal Tracker** at `/tracker` — track your streaming deal: daily
  deposits/wagers/cashouts, deposit bonuses & weekly lossback (plus custom
  reward types), leaderboard payout obligations, a daily task board, and a
  net-profit dashboard. Supports multiple deal "sheets" with separate terms,
  stored in your browser with JSON export/import.
- Live leaderboard ranked by total wagered amount
- Podium-style top 3 with gold / silver / bronze styling
- Countdown timer to contest end
- Auto-refreshes every 5 minutes
- Server-side API proxy keeps your API token secure

## Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done).
2. Go to [vercel.com](https://vercel.com) → New Project → import this repo.
3. Add the environment variable:
   - `ROOBET_API_TOKEN` = your Roobet affiliate JWT token
4. Deploy.

## Local development

```bash
cp .env.local.example .env.local
# Edit .env.local and add your token
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Affiliate link

Sign up at [roobet.com/?ref=lmb1](https://roobet.com/?ref=lmb1) to participate in the contest.
