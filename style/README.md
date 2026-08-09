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
   garment its title claims, writes one line per pick on why it suits you, and tags each one with
   its category, maker, material, and colour. This runs as several calls at once over slices of the
   pool rather than one call over all of it.

Pressing Build runs one continuous sequence: the form flies out of frame, your uploaded photos
sweep toward centre, the wardrobe assembles itself over them, and the chosen pieces hang inside it
in garment bags — **each batch's pieces dropping in as they're picked**, rather than everything
waiting on the slowest one. Hovering a bag clears it and shows the photo whole, with the price,
title, condition, why it was chosen, a link to the listing, and **Right for you?** — a yes or a no
that steers the next run.

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
- **A wide pool, a tight list.** Up to 10 queries × 30 results (50 once sizes are known, since a
  good fraction is about to be dropped for stating a size that can't fit) feed a candidate pool of
  ~120, from which curation keeps up to 9. Being selective requires something to select between.
- **The photo beats the title.** Curation sees thumbnails, so a listing captioned "waxed cotton
  jacket" showing a woman's cropped jacket gets dropped on sight. Images are requested at eBay's
  small rendition — token cost scales with area, and 400px is plenty to identify a garment.
- **It has to fit.** Sizes are filled in beside the price range and remembered per browser. A
  listing whose title states a size that can't fit is dropped before Claude ever sees it, and the
  sizes go into the curation prompt as well. See `lib/sizing.ts`.
- **Your yes and no outrank everything.** Votes are the only direct signal about whether a
  recommendation was actually good, so both Claude passes get them: the analyze pass writes queries
  away from what you rejected, and curation treats rejected titles as already turned down.
- **And what you do counts too.** Most people never press a button, so impressions, panel opens,
  and click-throughs to the listing are counted against each piece's material, colour, category, and
  maker — and the patterns that clear a confidence bar are put in front of both passes. See
  `lib/taste.ts`.

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
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Saving closets, and the yes/no feedback. Without them everything else still works; results just aren't kept and the vote control doesn't appear. | Vercel → Storage → Marketplace → Upstash |
| `SERPAPI_KEY` | Optional. Adds mainstream retail alongside eBay. | [serpapi.com](https://serpapi.com/manage-api-key) |

With `SERPAPI_KEY` unset the app searches eBay only and says so in the UI — a supported
configuration, not a broken one. Swapping SerpAPI for another provider (Oxylabs, Rainforest) means
rewriting `lib/sources/serpapi.ts`; nothing outside that file knows which provider is in use.

**SerpAPI's free tier is 100 searches a month**, and a run issues up to 10 queries. Sending all of
them would make Google Shopping useful for ten runs and then dead, so `QUERY_CAP` in
`lib/sources/index.ts` gives it only the first four — roughly twenty-five runs. Raise it if you're
on a paid plan. eBay has no such cap and sees every query.

Note `lib/sources/serpapi.ts` has never been exercised against the live service. If Google Shopping
results look wrong, check `toListing` against a real `shopping_results` payload before looking
anywhere else.

### Deploying

New Vercel project, **root directory `style`** — pointing it at the repository root builds the
sports-card app instead. Add the env vars above in project settings.

## Testing

```bash
npm test        # offline tests — no credentials, no network
npm run typecheck
npm run build
```

The tests cover the logic that doesn't need network: dedupe, per-query interleaving, the SerpAPI
query cap, both sources surviving the merge, closet-code validation, taste-memo and statistics
rendering, size parsing out of listing titles, thumbnail fetching against a local server, the
curation batch plan, wardrobe layout, API-error translation, and the full closet round-trip against
an in-memory stand-in for Upstash.

To exercise saved closets locally without an Upstash account:

```bash
node scripts/fake-upstash-serve.mjs 6380
UPSTASH_REDIS_REST_URL=http://127.0.0.1:6380 UPSTASH_REDIS_REST_TOKEN=dev npm run dev
```

That store is in memory and dies with the process. Local testing only.

To check that a vote actually reaches Claude — as opposed to merely reaching Redis — point the SDK
at a local capture server with `ANTHROPIC_BASE_URL` and read the outbound request body. Have it
answer `400`; the SDK retries 5xx five times, and the body is all you need:

```
ANTHROPIC_BASE_URL=http://127.0.0.1:6390 npm run dev
```

The rejected title should appear under "They said NO to" in `messages[0].content` for both the
analyze and the curate call, alongside the sizes and the attribute statistics. Asserting the
outbound body is the only thing that proves the wiring from cookie → route → lib → prompt, and it's
easy to break without any test noticing — the counters can be perfectly correct in Redis and still
reach nothing.

**Search quality has to be checked by eye, and it's the thing everything else depends on.** Start
here whenever you change a source:

```bash
curl "localhost:3000/api/style/shop?q=waxed+cotton+jacket&min=50&max=250"
```

Do the listings actually match the query? Are the URLs live? If this step is bad, no amount of
curation downstream saves the result.

## Things worth knowing

**Curation fetches the photos itself.** It used to hand the API image URLs and let it fetch them,
which works for eBay and fails for Google Shopping: the API's fetcher honours robots.txt, and
Google's thumbnail CDN disallows it. Because a message is rejected as a whole, a single unfetchable
photo failed all sixteen in its batch — so every retail listing poisoned whichever batch it landed
in, the moment those listings started reaching curation at all. `lib/thumbnails.ts` now fetches them
in parallel and sends the bytes inline, the same way uploaded photos already travel. These are the
same images the page loads into `<img>` tags moments later. **The property that matters is
containment: a photo that can't be fetched costs one candidate, never a batch** — which is what
`scripts/thumbnails.test.mjs` pins.

**Both sources have to survive the merge, and once didn't.** `interleaveByQuery` bucketed on the
query text alone, and because eBay's results are merged ahead of Google Shopping's, every bucket
read `[30 eBay, then 24 retail]`. The round-robin drains position 0 of each bucket, then position 1,
and a 120 cap over ten queries never gets past position 12 — which eBay fills on its own. Google
Shopping could be configured, working, and billed without one of its listings ever reaching the
candidate pool. It now takes turns across the sources *within* each query as well as across the
queries, and `scripts/sources.test.mjs` pins both properties. If you add a third source, that test
is the one that matters.

**A configured source that fails says so.** A source that isn't set up is announced under the form;
one that is set up and then errors or returns nothing used to be completely invisible — the run
succeeded, the closet filled from whatever did answer, and nothing indicated the key you just added
wasn't working. That now surfaces under the closet with the error text.

**Curation is several calls, not one.** It used to be a single call over 48 product photos, which
was the slowest thing in the app by a wide margin — every photo is fetched by the API before the
model can start. `lib/batching.ts` splits the pool into three slices of sixteen, each curated by its
own request, so the wait is the slowest slice rather than the sum of all of them and each slice's
pieces can hang the moment they arrive. Each batch is asked for three picks, about the same
selectivity as the old six-to-ten of forty-eight. Two consequences worth keeping: **nothing already
hanging is ever removed** when a later batch lands, which is why batches are asked for a few picks
rather than a whole closet; and each invocation is now short enough to sit inside Vercel Hobby's
60-second function cap.

**Sizes are asked, not learned.** No amount of watching someone browse reveals their inseam, and a
listing in the wrong size is worthless however good the piece is — so `lib/sizing.ts` holds a
sizing profile filled in beside the price range and remembered per browser. It's used twice: the
shop route drops any listing whose **title states** a size that can't fit, and the curation pass is
told the sizes so it can judge the photo too. The parsing is deliberately timid — a letter size has
to follow the word "size" or stand alone in upper case, denim has to arrive as `34x32`, a jacket
size needs its length letter — because a title that says nothing about size must survive. Dropping
a wearable piece costs more than passing an unwearable one to a pass that also reads the title.

**Learning is smoothed, and compared against your own average.** Every piece hung counts as an
impression; opening its panel, clicking through to the listing, and pressing yes or no are the
signals against it. Those accumulate per attribute — material, colour, category, and maker *within*
a category — in `taste:{id}:stats`. The trap is small numbers: one click on three impressions is
not a 33% rate, it's noise, and acting on it would let two unlucky runs wall off a whole material.
So an attribute needs five impressions before it can say anything, and what it says is a Wilson
interval rather than a raw rate — reported only when even its pessimistic bound beats your own
average, or its optimistic bound falls short of it. The memo carries the raw counts alongside, so
the model can weigh a 9-impression signal differently from a 40-impression one.

**The closet is the video, not a drawing of one.** The results view hangs garments over the clip
paused on its last frame, positioned in fractions of that frame — so there is no replica to drift
out of alignment. The clip already ends on the pose those coordinates were measured from (doors
wide open, one clear rail), which is why its `ended` event can be trusted as the handoff. **If you
ever re-cut the video, re-measure `lib/wardrobe.ts`** — every garment position reads from it, and
the browser check asserts each piece lands inside the measured carcass.

**Photos hang in bags because they can't be cropped.** eBay photos come in every aspect ratio and
framing there is; forcing them into a common box cut the toes off boots and the shoulders off
jackets. So the resting state is a uniform frosted bag with the photo blurred behind it, and hover
clears the bag and shows the photo `object-contain` — fitted, never cropped. The bag's outline is
an SVG stroke rather than a border, because a `clip-path` cuts a border off and eight pale bags
without outlines merge into one white band. Its shoulders are a curved run of points rather than a
straight taper: the slope has to steepen as the bag widens, or a wide bag reads as an envelope.

**What makes the photos legible is the bag's proportion, not the image code.** `object-contain`
fits a photo to whichever side is tighter, so a tall narrow bag shrinks a square product shot to
its width and leaves it floating in a column of white. Eight pieces on one rail gave each bag 5.6%
of the frame — about 55px on the page, with a 47px photo inside it. Two rails at four apiece
doubles the width and lets `BAG_RATIO` in `lib/wardrobe.ts` hold the shape at 1.2:1, which puts
~130px photos on the page. **The lower rail is drawn over the clip** — the footage has only one —
and the height of every bag follows from its width so the shape never changes with the count.

**The stage is narrower than the clip.** The wardrobe occupies the middle 44% of a 16:9 frame and
the rest is empty room, so the container crops to 4:3 (4:5 on phones) while the clip keeps its own
aspect and overflows sideways. That scales the wardrobe up by a third with no loss of detail, and
because the cavity sits dead centre of the frame the crop lands on it almost exactly — no zoom
state, no paging, and the garment coordinates are untouched.

**The detail panel sits below the wardrobe, in a slot of its own.** It used to float over the
bottom of the stage, which was fine with one row and covers the lower row with two. Its height is
reserved so the page doesn't jump on every hover, and the slot holds the hint line when nothing is
open rather than sitting empty; the title and reason are clamped so a long eBay title can't push
the panel out of it.

**Two hover bugs worth not reintroducing.** Tapping a bag in mobile Chromium fires `mouseenter`,
then `mouseleave` as the finger lifts, and *no click at all* — so the hover path opened the panel
and instantly closed it, and a tap could never pin it. `GarmentBag` therefore branches on
`pointerType` instead of trusting the emulated mouse events. Separately, closing the panel takes it
out of hit-testing, so the browser fires `mouseenter` on whatever bag was behind it without the
pointer moving, and the panel sprang back open on the wrong piece; `ClosetStage` remembers where
the close was clicked and ignores a hover arriving from that exact spot.

**Below `sm` the wardrobe goes portrait.** A 16:9 closet on a phone leaves the pieces too small to
read or tap. Rather than zooming and paging, the container becomes 4:5 and the clip keeps its own
aspect and overflows sideways — and because the cavity sits dead centre of the frame, the crop
lands on it almost exactly. No zoom state, no swipe, and the garment coordinates don't change.

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

**Feedback is per browser, and optional.** A vote is stored under a long-lived `taste_id` cookie in
the same Upstash instance as the closets — no account, no closet code needed. Without Upstash the
vote control simply doesn't render and both passes run without a memo. `renderMemo` walks votes
newest-first and skips titles it has already placed, so changing your mind about something replaces
the earlier verdict instead of leaving it in both lists.

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
  api/taste/route.ts        yes/no votes, and the memo they render into
  components/               StyleRunner owns the form→exiting→building→open→filled sequence;
                            ClosetStage is the wardrobe, the detail panel, and the vote control;
                            GarmentBag is one piece hanging on the rail in its bag
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
  thumbnails.ts                       fetches candidate photos for curation, because
                                      the API's own fetcher honours robots.txt and one
                                      rejected URL fails the whole message
  taste.ts                            what this browser said yes and no to, what it
                                      clicked, and the memo both Claude passes are given
  sizing.ts                           the sizing profile, and reading sizes out of titles
  batching.ts                         how the candidate pool is split for curation —
                                      imported by the browser, so it must never reach
                                      for anything that pulls in the Anthropic SDK
  closet.ts redis.ts                  persistence
scripts/                              offline tests and the Upstash stand-in
```
