# Scheduled jobs

The four Netlify scheduled functions are gone with the Netlify migration. The
endpoints they called are ordinary Next.js routes and are host-agnostic — all
that's needed is something to call them on a schedule.

Every job requires `Authorization: Bearer $CRON_SECRET` and **fails closed**
if `CRON_SECRET` is unset. That is deliberate: these routes act on every
tenant, so an unguarded one is far worse than it was when the app served a
single self-hosted user.

Each job also re-checks the relevant per-seller setting and plan, so running
them on a schedule is safe regardless of who has what enabled.

| Job | Suggested schedule | Endpoint | What it does |
|---|---|---|---|
| Scheduled publish | `*/15 * * * *` | `POST /api/cron/publish` | Publishes listings whose scheduled time has passed |
| Best offers | `*/30 * * * *` | `POST /api/cron/offers` | Auto-accepts offers above each seller's threshold (eBay expires them after 48h) |
| Research | `0 6 * * *` | `POST /api/research` | Nightly re-comp + proposals for live listings (Pro and above) |
| Relist | `0 8 * * *` | `POST /api/cron/relist` | Cycles stale listings past their cadence (Pro and above) |
| Usage reset | `0 3 1 * *` | `POST /api/cron/reset-usage` | Rolls monthly allowances over |

Research runs at 06:00 and relist at 08:00 so the relist pass sees the
proposals the research pass filed the same morning.

## Railway

Add one Cron service per row (Railway → New → Cron), each running:

```sh
curl -fsS -X POST "$PUBLIC_SITE_URL/api/cron/publish" \
  -H "Authorization: Bearer $CRON_SECRET"
```

`-f` makes curl exit non-zero on an HTTP error, so a failing job shows as a
failed run rather than a silent success.

## Anything else

Any scheduler works — GitHub Actions, cron-job.org, a system crontab. There is
nothing Railway-specific in the routes.

## Note on the usage reset

`lib/usage.ts` also rolls a seller's window over lazily when it is read, so a
missed reset delays the rollover rather than locking a paying customer out of
what they are paying for. The cron is the tidy path, not the only one.
