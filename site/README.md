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

- `app/(marketing)/` — the corridor walk. Its layout mounts Lenis smooth scroll,
  the custom cursor, and the header. None of that loads on product routes.
- `app/(app)/` — the product. Its layout is a wordmark that leads back out.
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

## How the product works

`PRODUCT.md` is the product's own documentation — the pipeline, why it recommends
what it does, how sign-in and saved closets work. It moved here unchanged when the
two apps merged.

## Still TODO

`lib/copy.ts` carries visible `TODO` placeholders for the website section's
heading and body, and `app/layout.tsx` for the meta description.
