# Logan-Brod

The repository root is one Next app; **the one that matters is in `site/`** — LevoZ
Labs' marketing page and Clozet, its menswear tool. Work in `site/` unless a task
is explicitly about the root app.

## Deployment: Railway

**We deploy on Railway, not Vercel.** `site/railway.json` holds the build and start
commands (`npm run start:railway`, which binds `0.0.0.0` and the port Railway
hands over); `site/RAILWAY.md` is the runbook, including the step about where the
Upstash database actually lives, which is the one that can lose data.

What that changes from the Vercel assumptions still written into `site/README.md`
and `site/LAUNCH.md`:

- **No 60-second function ceiling.** Six routes declare a `maxDuration` above it
  and they simply run. That was the single largest blocker on Hobby.
- **One long-lived Node process,** not a function per request. In-process state —
  the eBay token cache, the category tree — is shared and warm rather than cold
  on every call. Memory is the constraint instead of duration: fifty simultaneous
  runs peaked around 450 MB with placeholder images, so give the service 1 GB.
- **No "Root Directory" field.** Point the service at `site/` in its settings.
- **`--no-ff` merges and the empty-commit rule were Vercel behaviours.** Neither
  applies here, though merging `--no-ff` is still the house habit.
- The twice-daily sweep runs from `.github/workflows/sweep.yml` either way. Its
  `SITE_ORIGIN` variable has to point at the Railway domain.

Env vars are the same set, listed in `site/.env.local.example` and section 2 of
`site/LAUNCH.md`. Set them on the Railway service.

## Working here

- `npm run typecheck`, `npm test` (tsx, 378 tests), `npm run build` before anything
  is called done. ESLint is not configured; `npm run lint` opens Next's setup prompt.
- `npx tsx scripts/load/run.mjs --users 50` walks fifty virtual users through the
  whole product against imitated upstreams. No key is real and nothing leaves the
  machine. Run it after touching anything on the run path.
- `npm run audit:contrast` needs the server stopped and restarted after a build,
  or it audits stale pages.
- Kill the dev server by PID (`ps -eo pid,comm | awk '$2 ~ /^next-server/'`);
  `pkill -f` matches and kills the invoking shell.
- Never build while `next start` is serving `.next/` — the stale manifest shows
  up as "Application error" on every page.

## Branch

Develop on `claude/mens-style-recommendation-app-hlh3n9`; merging to `master` has
standing approval. Do not open a pull request unless asked.
