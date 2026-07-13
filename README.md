# Logan Brod — Web Tools

Next.js app with two features:

1. **Roobet Wager Leaderboard** (`/`) — real-time wager leaderboard for the **lmb1** Roobet affiliate code
2. **LevoZ Channel Diagnostics** (`/diagnostics`) — analyze any YouTube, Twitch, or Kick channel to see which videos perform best and why

## Roobet Wager Leaderboard

A real-time wager leaderboard for the **lmb1** Roobet affiliate code. Pulls data from the Roobet affiliate API and displays ranked players by total wager amount, with a live countdown to the contest end date (July 16, 2026).

- Live leaderboard ranked by total wagered amount
- Podium-style top 3 with gold / silver / bronze styling
- Countdown timer to contest end
- Auto-refreshes every 5 minutes
- Server-side API proxy keeps your API token secure

## LevoZ Channel Diagnostics

LevoZ-branded (dark + teal). Enter any YouTube channel (`@handle`, URL, or name), Twitch channel, or Kick channel (username or URL) and get:

- **Every video ranked 0–100** by a score blending lifetime views, views-per-day velocity, and engagement (likes + comments per view)
- **"Why it wins" chips on each top video** — e.g. "4.3× your median views", "posted on Saturday, your best day", "title uses winning keyword"
- **Channel-level insights** detected from your data:
  - Best day of week and time of day to publish
  - Video length sweet spot
  - Title length and winning title keywords
  - Channel momentum (are recent videos gaining views faster or slower?)
  - Engagement patterns and upload-consistency gaps

Insights only appear when there's enough data to support them (minimum sample sizes and lift thresholds), so they're patterns, not noise.

### Improvement plan (cross-reference engine)

Every diagnosis also produces an **improvement plan**: your measured patterns cross-referenced against published industry research (Backlinko's ranking-factors study, YouTube's official hashtag rules, Hootsuite/Sprout Social/Buffer posting-time studies, etc.). Each card shows:

- **Your data** — what your channel's numbers actually say
- **What the research says** — the industry benchmark, with sources linked
- **Do this** — a concrete action, marked ✓ Aligned / ▲ Adjust / ◆ Opportunity

Covered: posting day & time, title length, hashtag usage (including YouTube's 15-hashtag ignore rule), video length, upload frequency, engagement rate, winning keywords, and (for Twitch) clips strategy. When your data disagrees with the general studies, the plan says to trust your data — and how to verify.

Optionally set `TAVILY_API_KEY` to also pull **live web research** ("fresh from the web") alongside the curated benchmarks, so the advice stays current.

### Deep dive (your own channel)

Connect your Google account (button on the diagnostics page) to unlock private YouTube Analytics that the public API can't see:

- **Watch time & retention** per video, with laggards flagged
- **When your audience actually watches** (views by weekday from real viewing data, not publish dates)
- **Traffic sources** — search vs suggested vs Shorts vs subscribers, with strategy advice for your mix
- **Hidden gems** — videos with great retention but weak packaging (title/thumbnail)
- **Subscriber magnets** — which videos convert viewers into subscribers
- **Clickbait risk** — popular videos where viewers bail early

Auth is a standard Google OAuth flow; the refresh token is stored only in an httpOnly cookie in your own browser — no database, and nothing is shared.

**Data sources:** YouTube Data API v3 (up to 200 most recent uploads), Twitch Helix API (up to 100 VODs + 100 clips), Kick site API (VODs + top clips — no key needed, but it sits behind Cloudflare and can occasionally block server-side requests; the app surfaces a clear retry message when that happens), YouTube Analytics API v2 (deep dive). All keys and tokens stay server-side.

### Getting API keys

- **YouTube:** [console.cloud.google.com](https://console.cloud.google.com) → create a project → enable "YouTube Data API v3" → Credentials → API key (free tier is plenty)
- **Deep dive:** in the same Google Cloud project, also enable the "YouTube Analytics API", configure the OAuth consent screen, then Credentials → Create OAuth client ID (Web application) with redirect URI `<your-site>/api/auth/youtube/callback`
- **Twitch:** [dev.twitch.tv/console](https://dev.twitch.tv/console) → Register Your Application → copy the Client ID and generate a Client Secret
- **Live web research (optional):** free API key at [tavily.com](https://tavily.com)

## Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done).
2. Go to [vercel.com](https://vercel.com) → New Project → import this repo.
3. Add the environment variables:
   - `ROOBET_API_TOKEN` = your Roobet affiliate JWT token
   - `YOUTUBE_API_KEY` = your YouTube Data API v3 key
   - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` = your Twitch app credentials
   - `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` = for the deep dive (add your production URL's `/api/auth/youtube/callback` as an authorized redirect URI)
   - `TAVILY_API_KEY` = optional, enables live web research
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
