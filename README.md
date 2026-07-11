# Logan Brod — Web Tools

Next.js app with two features:

1. **Roobet Wager Leaderboard** (`/`) — real-time wager leaderboard for the **lmb1** Roobet affiliate code
2. **Channel Diagnostics** (`/diagnostics`) — analyze any YouTube or Twitch channel to see which videos perform best and why

## Roobet Wager Leaderboard

A real-time wager leaderboard for the **lmb1** Roobet affiliate code. Pulls data from the Roobet affiliate API and displays ranked players by total wager amount, with a live countdown to the contest end date (July 16, 2026).

- Live leaderboard ranked by total wagered amount
- Podium-style top 3 with gold / silver / bronze styling
- Countdown timer to contest end
- Auto-refreshes every 5 minutes
- Server-side API proxy keeps your API token secure

## Channel Diagnostics

Enter any YouTube channel (`@handle`, URL, or name) or Twitch channel (username or URL) and get:

- **Every video ranked 0–100** by a score blending lifetime views, views-per-day velocity, and engagement (likes + comments per view)
- **"Why it wins" chips on each top video** — e.g. "4.3× your median views", "posted on Saturday, your best day", "title uses winning keyword"
- **Channel-level insights** detected from your data:
  - Best day of week and time of day to publish
  - Video length sweet spot
  - Title length and winning title keywords
  - Channel momentum (are recent videos gaining views faster or slower?)
  - Engagement patterns and upload-consistency gaps

Insights only appear when there's enough data to support them (minimum sample sizes and lift thresholds), so they're patterns, not noise.

**Data sources:** YouTube Data API v3 (up to 200 most recent uploads) and Twitch Helix API (up to 100 VODs + 100 clips). API keys stay server-side.

### Getting API keys

- **YouTube:** [console.cloud.google.com](https://console.cloud.google.com) → create a project → enable "YouTube Data API v3" → Credentials → API key (free tier is plenty)
- **Twitch:** [dev.twitch.tv/console](https://dev.twitch.tv/console) → Register Your Application → copy the Client ID and generate a Client Secret

## Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done).
2. Go to [vercel.com](https://vercel.com) → New Project → import this repo.
3. Add the environment variables:
   - `ROOBET_API_TOKEN` = your Roobet affiliate JWT token
   - `YOUTUBE_API_KEY` = your YouTube Data API v3 key
   - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` = your Twitch app credentials
4. Deploy.

## Local development

```bash
cp .env.local.example .env.local
# Edit .env.local and add your keys (each feature works independently —
# you only need the keys for the features you use)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Affiliate link

Sign up at [roobet.com/?ref=lmb1](https://roobet.com/?ref=lmb1) to participate in the contest.
