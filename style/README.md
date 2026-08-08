# Closet — men's style recommender

Upload a few pieces you think look good. Claude reads the style across them, searches for real
listings in your price range that would extend it, throws out the ones that don't fit, and puts
what's left into outfits. Everything is saved under a short code so it's still there next time.

This is a standalone app. The repository root is a different project (sports-card tools) — this one
lives entirely in `style/` and deploys separately.

## How it works

1. **Upload** — 1–6 photos go to Vercel Blob, which gives Claude URLs it can fetch.
2. **Analyze** (Claude, vision) — reads aesthetic, palette, silhouette, fabrics, formality, and the
   gaps, then writes 6–8 specific shopping queries. "Brown suede chelsea boot", not "men's shoes" —
   the specificity is what makes the search step worth anything.
3. **Shop** (no Claude) — every query runs against eBay and Google Shopping in parallel. Results are
   normalized to one shape, deduped, and interleaved per query so one broad query can't crowd out
   the narrower ones.
4. **Curate + outfits** (Claude, twice) — scores the candidates from titles and prices alone, drops
   the keyword-search junk, and writes one line per pick on why it suits you. Then builds 2–3
   outfits from what survived.

Roughly $0.15–0.30 in API cost per full run, dominated by the vision pass.

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
| `BLOB_READ_WRITE_TOKEN` | Photo upload. Without it you can't start a run. | Vercel → Storage → Blob |
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

**Photo URLs are public.** Vercel Blob URLs are unguessable but not access-controlled — the Claude
API has to reach them over the open internet. That's fine for photos of clothing; worth knowing
before anyone uploads a photo of a person.

**A closet code is the only credential.** Anyone with the code can open that closet. There are no
accounts. Codes are 6 characters from a 31-character alphabet with `0/O/1/I/L` excluded so they
survive being read aloud, and are allocated with `SET NX` so a collision can never overwrite
someone else's closet. Closets expire after 90 days, refreshed every time one is opened.

**eBay category scoping is deliberately broad.** `lib/sources/ebay.ts` scopes to category `11450`
(Clothing, Shoes & Accessories). The menswear leaves — `1059`, `93427`, `4250` — are left commented
out because eBay renumbers leaf categories periodically and a wrong ID silently returns nothing. To
narrow it, check the live tree first:

```
GET /commerce/taxonomy/v1/category_tree/0    # marketplace EBAY_US
```

Until then menswear specificity comes from the query text, which is why the analyze prompt pushes
so hard on writing specific queries.

## Layout

```
app/
  page.tsx                  upload, price range, and the live run
  closet/[code]/page.tsx    permalink for a saved closet
  api/style/{analyze,shop,curate}/route.ts
  api/closet/{route,upload/route}.ts
  components/               StyleRunner is the interactive flow; the rest are pure render
lib/
  analyze.ts curate.ts outfits.ts    one file per Claude pass
  schemas.ts                          zod schemas — note these import from `zod/v4`,
                                      which is what the SDK's zodOutputFormat is typed against
  anthropic.ts                        client, model choice, refusal handling
  sources/                            ebay.ts + serpapi.ts behind one normalized shape
  closet.ts redis.ts blob.ts          persistence
scripts/                              offline tests and the Upstash stand-in
```
