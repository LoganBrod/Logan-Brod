# Closet — men's style recommender

Upload a few pieces you think look good. Claude reads the style across them, searches for real
listings in your price range that would extend it, throws out the ones that don't fit, and puts
what's left into outfits. Everything is saved under a short code so it's still there next time.

This is a standalone app. The repository root is a different project (sports-card tools) — this one
lives entirely in `style/` and deploys separately.

## How it works

1. **Upload** — 1–6 photos are downscaled in your browser and sent to Claude inline. No storage
   service involved; the photos are never hosted anywhere.
2. **Analyze** (Claude, vision) — reads aesthetic, palette, silhouette, fabrics, formality, and the
   gaps, then writes 6–8 specific shopping queries. "Brown suede chelsea boot", not "men's shoes" —
   the specificity is what makes the search step worth anything.
3. **Shop** (no Claude) — every query runs against eBay and Google Shopping in parallel. Results are
   normalized to one shape, deduped, and interleaved per query so one broad query can't crowd out
   the narrower ones.
4. **Curate** (Claude) — **looks at each candidate's photo**, throws out anything that isn't the
   garment its title claims, and writes one line per pick on why it suits you.

Results hang in a virtual closet; hovering a piece slides up its price, title, condition, and why
it was chosen. While the pipeline runs, a wardrobe assembles itself on screen.

Roughly $0.20–0.30 in API cost per full run, split between the two vision passes.

### Why it recommends what it does

Search quality decides everything downstream, so most of the work is upstream of Claude:

- **Relevance, not price.** eBay is queried on Best Match. Sorting by price ascending — the
  obvious thing to do with a budget — returns the cheapest items matching the words, which on eBay
  means insoles, size-chart listings, and replicas.
- **Menswear is enforced twice.** Searches are scoped to eBay's men's categories, resolved from
  the live Taxonomy API at runtime rather than hardcoded (leaf IDs get renumbered, and a stale one
  fails silently by returning nothing). Titles are then filtered again in `lib/sources/menswear.ts`,
  because sellers miscategorise constantly and Google Shopping has no categories at all.
- **A wide pool, a tight list.** Up to 10 queries × 30 results feed a candidate pool of ~120, from
  which curation keeps 6–10. Being selective requires something to select between.
- **The photo beats the title.** Curation sees thumbnails, so a listing captioned "waxed cotton
  jacket" showing a woman's cropped jacket gets dropped on sight. Images are requested at eBay's
  small rendition — token cost scales with area, and 400px is plenty to identify a garment.

## Setup

```bash
cd style
npm install
cp .env.local.example .env.local   # fill it in
npm run dev
```

### Environment variables

| Variable | Needed for | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Required.** All three Claude passes. | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | **Required.** The primary shopping source. | [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys) |
| `EBAY_ENV` | Optional. `sandbox` or `production` (default). | — |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Saving closets. Without them everything else still works; results just aren't kept. | Vercel → Storage → Marketplace → Upstash |
| `SERPAPI_KEY` | Optional. Adds mainstream retail alongside eBay. | [serpapi.com](https://serpapi.com/manage-api-key) |

With `SERPAPI_KEY` unset the app searches eBay only and says so in the UI — a supported
configuration, not a broken one. Swapping SerpAPI for another provider (Oxylabs, Rainforest) means
rewriting `lib/sources/serpapi.ts`; nothing outside that file knows which provider is in use.

### Deploying

New Vercel project, **root directory `style`** — pointing it at the repository root builds the
sports-card app instead. Add the env vars above in project settings.

## Testing

```bash
npm test        # offline tests — no credentials, no network
npm run typecheck
npm run build
```

The tests cover the logic that doesn't need network: dedupe, per-query interleaving, closet-code
validation, and the full closet round-trip against an in-memory stand-in for Upstash.

To exercise saved closets locally without an Upstash account:

```bash
node scripts/fake-upstash-serve.mjs 6380
UPSTASH_REDIS_REST_URL=http://127.0.0.1:6380 UPSTASH_REDIS_REST_TOKEN=dev npm run dev
```

That store is in memory and dies with the process. Local testing only.

**Search quality has to be checked by eye, and it's the thing everything else depends on.** Start
here whenever you change a source:

```bash
curl "localhost:3000/api/style/shop?q=waxed+cotton+jacket&min=50&max=250"
```

Do the listings actually match the query? Are the URLs live? If this step is bad, no amount of
curation downstream saves the result.

## Things worth knowing

**Photos are never stored.** They're downscaled to a 1568px long edge in the browser, sent to
Claude inline as base64, and that's it — nothing is written to disk or to any storage service, and
saved closets hold no images. The downscale also cuts the vision token cost substantially; full
resolution buys nothing for reading a garment's cut and colour.

**A closet code is the only credential.** Anyone with the code can open that closet. There are no
accounts. Codes are 6 characters from a 31-character alphabet with `0/O/1/I/L` excluded so they
survive being read aloud, and are allocated with `SET NX` so a collision can never overwrite
someone else's closet. Closets expire after 90 days, refreshed every time one is opened.

**eBay categories are resolved, not hardcoded.** `lib/sources/ebayCategories.ts` reads the live
category subtree under `11450` and picks the branches whose names start with "Men". If that lookup
fails or times out, it falls back to the whole Clothing/Shoes/Accessories root and the title filter
does the work instead — narrower quality, never a broken search. Watch for
`[ebay] falling back to the full clothing category` in the logs if results start looking
gender-mixed.

## Layout

```
app/
  page.tsx                  upload, price range, and the live run
  closet/[code]/page.tsx    permalink for a saved closet
  api/style/{analyze,shop,curate}/route.ts
  api/closet/route.ts
  components/               StyleRunner drives the flow; Closet hangs the results on rails;
                            BuildingCloset plays the loading animation
public/                     closet-building.{webm,mp4,jpg} — the loading animation. WebM is
                            listed first for Chromium builds without proprietary codecs; the
                            MP4 covers Safari and iOS, which don't decode VP9 in <video>.
                            The palette in tailwind.config.ts is sampled from this render.
lib/
  analyze.ts curate.ts outfits.ts    one file per Claude pass
  image.ts photos.ts                  browser-side downscaling, and the photo selection rules
  schemas.ts                          zod schemas — note these import from `zod/v4`,
                                      which is what the SDK's zodOutputFormat is typed against
  anthropic.ts                        client, model choice, refusal handling
  sources/                            ebay.ts + serpapi.ts behind one normalized shape
                                      menswear.ts holds the title filters; ebayCategories.ts
                                      resolves men's category IDs at runtime
  closet.ts redis.ts                  persistence
scripts/                              offline tests and the Upstash stand-in
```
