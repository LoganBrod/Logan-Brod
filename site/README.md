# LevoZ Labs

One Next.js app serving both halves of the company:

| Route | What it is |
|---|---|
| `/` | The marketing site — one scroll-driven walk down a wardrobe corridor |
| `/closet` | The product: upload pieces you like, get a closet built from real listings |
| `/closet/[code]` | A saved closet |
| `/closets` | Every closet you've built |
| `/api/**` | The product's endpoints (Claude, eBay, Google Shopping, auth, taste) |

## Layout

- `app/components/SideNav.tsx` — the shared rail: About / Closet / Saved, plus
  the wordmark and a contact link. Mounted once in the root layout, so it is the
  same on both halves. A column down the left on desktop, a bar across the top on
  phones, with `aria-current` following the route.
- `app/(marketing)/` — the corridor walk. Its layout mounts Lenis smooth scroll
  and the custom cursor. Neither loads on product routes.
- `app/(app)/` — the product. Its layout only clears the rail.
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

`vercel.json` registers the twice-daily standing-closet sweep. It needs
`CRON_SECRET` set, or `/api/cron/sweep` refuses every request — deliberately, so
an endpoint that spends money on model calls is never left open.

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

## Still TODO

`lib/copy.ts` carries visible `TODO` placeholders for the website section's
heading and body, and `app/layout.tsx` for the meta description.
