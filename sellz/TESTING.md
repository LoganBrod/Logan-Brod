# Testing the recent changes

Four commits, roughly 2,100 lines: the dark-first visual pass, Depop listing
generation and tracking, the scheduled Brain pipeline, and Depop sale detection
by forwarded email.

Ordered by risk, not by feature. The first three sections are where a problem
would be expensive and quiet; the last two are where a problem is obvious the
moment you look.

---

## 0. Before anything else

Railway now runs `node scripts/migrate.mjs` on deploy, which applies committed
migrations instead of letting `db push` diff the schema and guess. The first
deploy after this change baselines the existing database automatically and logs
`[migrate] Existing database with no migration history` — that line appears
once, ever. Check the deploy log for it.

Confirm the schema landed — everything below depends on it:

```sh
# Railway → your service → Data, or psql against DATABASE_URL
\d "Listing"      -- expect a "depop" json column
\d "User"         -- expect "inboundToken"
\d "InboundSale"  -- expect the table to exist
```

Also expect a `_prisma_migrations` table with two rows. If the columns are
missing, the pre-deploy step failed and nothing else here will work until it is
fixed — read the deploy log rather than re-running blind.

### Changing the schema from now on

`db push` is gone. Edit `prisma/schema.prisma`, then:

```sh
npx prisma migrate dev --name what_you_changed
```

That writes a migration under `prisma/migrations/`. **Commit it with the code.**
Deploys apply exactly those files, so a schema change without its migration
file will start an app whose code expects columns the database doesn't have.

**The new cron does not run until you create it.** Adding the route did not
schedule anything. See §3.

---

## 1. The eBay sync refactor — highest risk

The reconciliation that matches eBay listings to local rows moved out of the
route into `lib/ebaySync.ts` so the button and the cron share one copy. It is
behaviourally identical, but this is the code that decides *update this row* vs
*create a new one*, and a regression here silently duplicates a seller's whole
inventory or wipes their traffic history.

Test on a real connected account:

1. Note your listing count on the Listings page.
2. Press **Sync from eBay**.
3. Count again. It must be **unchanged** — same rows updated, nothing created.
4. Press it a second time. Still unchanged.
5. Open a listing that has been live a while and confirm its views/watchers
   history is intact, not reset to zero.

If step 3 or 4 creates duplicates, stop and revert `a27735e..HEAD`; do not run
the cron, which would repeat the same reconciliation every six hours.

---

## 2. The middleware change — security-relevant

`/api/inbound/email` was added to the list of routes that authenticate
themselves instead of by session. Verify nothing else became reachable:

```sh
BASE=https://your-domain

# Must be 401 "Sign in to continue" — signed-in seller data
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/inbound
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/listings
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/settings

# Must be 401 "Unauthorized" — reaches the route, rejects the caller
curl -s -X POST $BASE/api/inbound/email

# Must be 401 — crons still fail closed
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/cron/pipeline
```

The distinction matters: `"Sign in to continue"` comes from the middleware,
`"Unauthorized"` comes from inside the route. The webhook must return the
second — if it returns the first, the provider will be rejected before the
route runs and no sale will ever be recorded.

---

## 3. The scheduled Brain pipeline

**It is not running yet.** Create a Railway Cron service on `0 */6 * * *`:

```sh
curl -fsS -X POST "$PUBLIC_SITE_URL/api/cron/pipeline" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Before scheduling it, run it once by hand and read the output:

```sh
curl -s -X POST "$BASE/api/cron/pipeline" \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

You get per-tenant counts and an `errors` array. Check:

- `synced` is present and sane — no `sync:` error means eBay tokens are valid.
- `scored` / `comped` / `diagnosed` are non-zero on the first run if you have
  listings missing those, and drop toward zero on later runs. Persistently
  zero on the first run means the selection filters aren't matching anything;
  persistently high means work isn't being saved.
- `errors` is empty. An expired eBay token shows up here rather than throwing.

Then verify it changed real data: open a listing that had no Brain score and
confirm one appeared, and one live 14+ days and confirm a diagnosis did.

**Run it twice in a row.** The second run should do almost nothing — every pass
selects by "still missing", so a second pass re-scoring the same listings means
results aren't persisting.

### Against your original list

| You asked for | Status |
|---|---|
| Sync eBay listings on a schedule | Done — every 6h |
| Record outcomes automatically | Done, but via the **listing sync**, not the Orders API. Sold price/date come from the listing record. Partial refunds and fees are not picked up. |
| Auto-score new listings | Done for **unscored** listings. A listing you *edit* is not re-scored — that gap is still open. |
| Auto-comps on new listings | Done, live listings only |
| Re-analyze playbook every 3rd sale | Done |
| Auto-diagnose stale 14+ days | Done |
| Apply fixes per automation settings | **Already existed** in `/api/cron/research` — unchanged by this work |

The two gaps worth deciding on: re-scoring after an edit, and outcomes from the
Orders API rather than the listing record.

---

## 4. Depop generation and tracking

Needs `ANTHROPIC_API_KEY`. On any listing, open the **Depop** tab:

1. Press **Write the Depop version**. Confirm the result is genuinely different
   from the eBay copy — lower case, conversational, no keyword-stuffed title,
   at most 5 hashtags. If it reads like the eBay listing, the Depop prompt
   isn't being applied.
2. Check the price is at or below the eBay ask, never above.
3. Copy the description and paste it somewhere — confirm hashtags come with it.
4. Press **I posted it on Depop**, then save views/likes, then mark it sold.
   Confirm the sale shows up in analytics and the listing reads as sold.
5. Paste a non-Depop URL into the link field. It must be rejected.

Then confirm the tracking actually accumulates: save numbers twice with
different values, and check the listing's traffic history has two readings
rather than one overwritten. That history is what the proposal engine reads.

---

## 5. Depop sale detection by email

Off unless `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` are both set, plus
a domain pointed at an inbound provider. Until then §4's manual path is the
fallback and nothing here applies.

**This is the least proven code in the batch** — it has never seen a real Depop
email. Test it with one before trusting it:

1. `POST /api/inbound` while signed in to mint your forwarding address.
2. Set a filter in your mail client: from `depop.com` → forward to it.
3. Make or wait for a real Depop sale, and let the email through.
4. Check `GET /api/inbound` for the parsed result.

What to look for, in order of how badly it fails:

- **Wrong listing marked sold** — the serious one. If it happens, the
  similarity thresholds in `lib/inboundEmail.ts` are too loose for your
  inventory. Raise `AUTO_MATCH`.
- **Everything lands in pending** — thresholds too tight, or the forwarded mail
  loses its Depop origin so nothing is `verified`. Check the stored row.
- **Nothing arrives at all** — the provider isn't posting, or is being
  rejected. Check its delivery log for a 401, which means the bearer secret is
  wrong (§2 covers the other cause).

Forward a **non-sale** Depop email too — a like, a follow, a marketing blast.
It must be ignored, not recorded as a sale.

There is no UI for the address or the pending queue yet. Both are API-only, so
this section is `curl` for now.

---

## 6. The visual changes

Quickest to check, cheapest to fix.

- A signed-out browser with no stored preference should load **dark**.
- The theme toggle still works both ways, and the phone's status bar colour
  follows it rather than staying dark on a light page.
- An existing user's stored light preference is **preserved** — dark is the new
  default, not an override.
- The hero CTA renders as a blue→violet→pink gradient with white text.
- On a real mid-range Android, scroll the Listings page with 20+ listings and
  watch for jank. Glass is deliberately kept off list rows for this reason; if
  it still stutters, the blur radius in `.glass` is the dial.
- A Depop listing appears in the "Your Depop shop" grid as a square card, and
  tapping it scrolls to the full listing.

Check both themes at 375px wide. Zero horizontal scroll anywhere.

---

## What is verified and what is not

Verified here: production build, `tsc`, cron and webhook auth (401 without a
secret, reaching the handler with one), `/api/inbound` still session-gated, and
the sale-matching thresholds against five cases including two near-identical
items, where it correctly declines to guess.

Not verified: anything requiring a database, eBay credentials, an Anthropic key
or a real Depop email — this environment has none of them. That covers the
pipeline's actual passes, Depop generation, and the whole email path.
