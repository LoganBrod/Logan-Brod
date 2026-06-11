# LuckyStack Casino

A free-play demo casino built with React, TypeScript, Vite, and Tailwind CSS,
inspired by the look and feel of sites like Shuffle and Roobet.

All balances are virtual demo credits stored in your browser&apos;s local
storage &mdash; **no real money is ever wagered, deposited, or paid out.**

## Games

- **Blackjack** &mdash; classic table game with hit, stand, double down,
  blackjack pays 3:2, dealer stands on 17.
- **Plinko** &mdash; canvas-based physics drop with selectable risk
  (low/medium/high) and row count (8/12/16), color-coded multiplier slots.

The lobby also previews a few "coming soon" games (Dice, Roulette, Crash,
Mines) for that full casino-lobby feel.

## Kick rewards

The **Rewards** page lets viewers log in with Kick and earn points for
hanging out in your stream chat &mdash; **20 points for every 10 minutes**
of chat activity while you're live, plus a leaderboard. Redeeming points for
perks is marked "coming soon" for now; this phase just tracks balances.

This feature needs a small always-on backend (OAuth + a webhook receiver),
which can't run from `npm run dev` alone. It's implemented as serverless
functions under [`api/`](api) designed for **Vercel** + **Upstash Redis**
(both have generous free tiers and need no servers to manage).

### How it works

- Viewers click **Login with Kick**, which runs an OAuth 2.1 + PKCE flow
  (`api/auth/login.ts`, `api/auth/callback.ts`) and stores a signed session
  cookie.
- Kick's API doesn't expose live watch-time directly, so activity is
  approximated via chat presence: every `chat.message.sent` webhook event
  (`api/webhooks/kick.ts`) advances the sender's "watching" clock. If a
  viewer goes quiet for more than 15 minutes, their progress resets. Every
  10 accumulated minutes awards 20 points.
- Points and the leaderboard are stored in Redis (`api/_lib/points.ts`) and
  served via `api/me.ts` and `api/leaderboard.ts`.

### Setup

1. **Create a Kick OAuth app** at your Kick developer settings. Set the
   redirect URI to `https://<your-domain>/api/auth/callback`.
2. **Deploy to Vercel** (`vercel.json` is already configured for SPA routing
   + the `/api` functions).
3. **Add an Upstash Redis database** (Vercel Marketplace integration, or
   create one at upstash.com) and link its REST URL/token to the project.
4. **Set environment variables** in Vercel (see [`.env.example`](.env.example)):
   `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_REDIRECT_URI`,
   `SESSION_SECRET` (e.g. `openssl rand -base64 32`), `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_SECRET` (any random string you choose).
5. **Point Kick's webhook delivery** for your app at
   `https://<your-domain>/api/webhooks/kick`.
6. **Run the one-time subscription setup**: as the channel owner, visit
   `https://<your-domain>/api/admin/subscribe?secret=<ADMIN_SECRET>` and
   approve the OAuth prompt. This subscribes your channel's
   `chat.message.sent` events so the webhook starts receiving chat activity.

Once deployed, the Rewards page in the sidebar will show a "Login with Kick"
button, points balance, progress toward the next reward, and the
leaderboard. When previewed without the backend (e.g. plain `npm run dev`),
the page shows a notice that the rewards backend isn't connected instead of
breaking.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser. Use the **Refill** button
in the top bar to reset your demo balance back to 1,000 credits at any time.

## Scripts

- `npm run dev` &mdash; start the Vite dev server
- `npm run build` &mdash; type-check and build for production
- `npm run preview` &mdash; preview the production build
- `npm run lint` &mdash; run ESLint
