# LevoZ Labs

One Next.js app serving both halves of the company:

| Route | What it is |
|---|---|
| `/` | The marketing site — one scroll-driven walk down a wardrobe corridor |
| `/closet` | Clozet — upload pieces you like, get one built from real listings |
| `/closet/tools` | Sizing, "is this any good?", and standing scans |
| `/closet/saved` | Every Clozet you've built |
| `/closet/[code]` | A saved Clozet |
| `/accessories` | The small things, chosen against the style a Clozet read |
| `/colognes` | Recommended rather than searched — see the page for why |
| `/calibrate` | Fifteen swipes that sharpen the profile, with no model call |
| `/api/**` | The endpoints (Claude, eBay, Google Shopping, auth, taste, fit, social) |

Clozet's three tabs are real routes, so each one is linkable, openable in a new
window and reachable with the back button. Closet codes are six uppercase
characters, so `tools` and `saved` can never collide with `/closet/[code]`.

Five paths redirect rather than 404, because every one of them has been linked
from the menu, the footer, or somebody's bookmarks:

| Was | Now |
|---|---|
| `/tools`, `/sizing`, `/scan` | `/closet/tools` (the last two anchored) |
| `/closets` | `/closet/saved` |
| `/wardrobe`, `/discover` | `/closet` — both are off the menu for now |

Wardrobe and Discover are off the menu, not deleted: their components, API
routes and tests are all still here, and putting either one back is one page
file.

## Layout

- `app/components/SideNav.tsx` — the shared menu, despite the name: a button
  fixed top-left that opens a panel. Mounted once in the root layout, so it is
  the same on both halves. It used to be a permanent rail, which cost 13rem of
  every page and boxed the marketing walk into a frame. Closes on Escape, on the
  backdrop, and on arriving somewhere new.
- `app/(marketing)/` — the corridor walk. Its layout mounts Lenis smooth scroll,
  which does not load on product routes. There was a custom cursor here too — a
  dot with a trailing ring — removed because a ring that lags the pointer makes
  people doubt the page is listening.
- `app/(app)/` — the product. Its layout only leaves room for the menu button.
- `app/api/` — unchanged from the standalone product; paths did not move.
- `lib/copy.ts` — every word the marketing side says, in one file.
- `public/frames/` — 197 JPEGs: the doors opening, then the corridor walk.
  Fetched only by the marketing route.

## Run it

```bash
npm install
cp .env.local.example .env.local   # fill in at least ANTHROPIC_API_KEY + the eBay pair
npm run dev                        # http://localhost:3000
npm test                           # the product's suite
```

## Deploy

One Vercel project, **Root Directory `site`**. The marketing page prerenders as
static; product routes are server-rendered on demand. Set the env vars from
`.env.local.example` in the Vercel project — the marketing half needs none of
them, but the product will not run without them.

The twice-daily standing-closet sweep is scheduled from
`.github/workflows/sweep.yml`, not from the host. Vercel's Hobby plan allows two
cron jobs and triggers them once a day, which a twice-daily sweep doesn't fit;
`/api/cron/sweep` is a plain authenticated `GET`, so any scheduler can drive it
and GitHub Actions is free. It needs two settings under the repository's
Settings → Secrets and variables → Actions:

| | |
|---|---|
| secret `CRON_SECRET` | the same value as the deployment's |
| variable `SITE_ORIGIN` | e.g. `https://www.levozlabs.com` |

Without `CRON_SECRET` set on the deployment the endpoint refuses every request —
deliberately, so an endpoint that spends money on model calls is never left open.
GitHub disables scheduled workflows after 60 days without a push, so if sweeps
stop arriving after a quiet stretch, re-enable it on the Actions tab.

Four routes declare a `maxDuration` above 60s, which is the Hobby ceiling — see
`RAILWAY.md` for what that costs and what to do about it.

### Four things that will make a green build serve the wrong thing

Each of these cost us a round of "why can't I see the changes".

1. **Root Directory must be `site`.** The repository root is a *second*, unrelated
   Next app. Leave the field empty and Vercel builds that one instead, with no
   error to tell you so.
2. **Empty commits never deploy.** The project has *skip deployments when there
   are no changes to the root directory* enabled — right, because commits that
   only touch the repo root shouldn't rebuild this app. The consequence is that
   `git commit --allow-empty` is silently discarded. To force a rebuild, change a
   file under `site/` or use Vercel's Redeploy button.
3. **`--ff-only` merges don't produce a production build.** Fast-forwarding
   `master` to the feature branch leaves both refs on the same SHA. Vercel builds
   a SHA once and credits it to whichever ref it saw first — the branch — so the
   build lands as a Preview and `master` never gets a Production one. Merge with
   `--no-ff`, or push a `site/` change to `master` directly.
4. **The product is at `/closet`, not `/`.** `/` has been the marketing corridor
   since the two apps merged. A bookmark to `/` looks like the app disappeared.

## How the product works

`PRODUCT.md` is the product's own documentation — the pipeline, why it recommends
what it does, how sign-in and saved closets work. It moved here unchanged when the
two apps merged.

## A note on the name

The product is **Clozet**; the route is `/closet`. That mismatch is deliberate —
every saved closet's link and every share card carries a `/closet/CODE` URL, so
renaming the route would break links already in the wild. The spelling is a
display decision, and it stops at the surface: wire fields, types, cookies and
Redis keys all still say `closet`.
