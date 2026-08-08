# Closet — men's style recommender

Upload a few pieces you think look good. Claude reads the style across them, searches for real
listings in your price range that would extend it, throws out the ones that don't fit, and hangs
what's left in a closet. Everything is saved under a short code so it's still there next time.

This is a standalone app. The repository root is a different project (sports-card tools) — this one
lives entirely in `style/` and deploys separately.

## How it works

1. **Upload** — 1–6 photos are downscaled in your browser and sent to Claude inline. No storage
   service involved; the photos are never hosted anywhere.
2. **Analyze** (Claude, vision) — reads aesthetic, palette, silhouette, fabrics, formality, and the
   gaps, then writes 8–10 specific shopping queries. "Brown suede chelsea boot", not "men's shoes" —
   the specificity is what makes the search step worth anything.
3. **Shop** (no Claude) — every query runs against eBay and Google Shopping in parallel. Results are
   normalized to one shape, deduped, and interleaved per query so one broad query can't crowd out
   the narrower ones.
4. **Curate** (Claude) — **looks at each candidate's photo**, throws out anything that isn't the
   garment its title claims, and writes one line per pick on why it suits you.

Pressing Build runs one continuous sequence: the form flies out of frame, your uploaded photos
sweep toward centre, the wardrobe assembles itself over them, and the chosen pieces hang inside it.
Hovering a piece lifts it and shows its price, title, condition, and why it was chosen.

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

**The closet is the video, not a drawing of one.** The results view hangs garments over the clip
paused on its last frame, positioned in fractions of that frame — so there is no replica to drift
out of alignment. The clip is trimmed to end exactly on the pose those coordinates were measured
from (t=2.75s, doors wide open), which is why its `ended` event can be trusted as the handoff. **If
you ever re-cut the video, re-measure `lib/wardrobe.ts`** — every garment position reads from it,
and the browser check asserts each piece lands inside the measured carcass.

**A busy API doesn't cost you the run.** Anthropic returns `529 overloaded_error` when it's
momentarily saturated. The client retries five times with the SDK's own backoff, which absorbs most
of it. If curation still fails, the wardrobe stays built and **Try again** re-runs *only* that
pass — the vision call and the eBay searches are already paid for and are kept. `describeApiError`
in `lib/anthropic.ts` translates SDK exceptions into sentences; without it a route returns
`err.message`, which for an API error is the status code plus the whole serialised body.

It identifies errors by **shape, not `instanceof`** — the SDK ships CJS and ESM builds, so a caller
resolving a different one gets a different `APIError` class and every identity check silently fails
open, dumping the raw JSON. `constructor.name` is no safer once the production build is minified.

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
  components/               StyleRunner owns the form→exiting→building→open→filled sequence;
                            ClosetStage is the wardrobe and everything hung in it;
                            HungGarment is one piece on the rail
public/                     closet-building.{webm,mp4,jpg} — the build animation. WebM is
                            listed first for Chromium builds without proprietary codecs; the
                            MP4 covers Safari and iOS, which don't decode VP9 in <video>.
                            The palette in tailwind.config.ts is sampled from this render.
lib/
  analyze.ts curate.ts                one file per Claude pass
  wardrobe.ts                         where the closet sits in the clip's final frame —
                                      measured, not guessed; everything positional reads from it
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
