# school-os · the brain

Scripts that read your School vault, call Claude, and file your notes. Right
now there is one: `ingest`, the inbox sorter. Drop anything into `00 Inbox`
and it comes out as a markdown note under the right course and unit.

What goes in:

| You have | Do this | It becomes |
|---|---|---|
| Paper notes | Scan with Genius Scan, export as **PDF** into the inbox | A transcribed markdown note, with the PDF kept in `_sources/` |
| A handout or reading from Schoology | Download it (PDF or Word) into the inbox | A markdown copy, original kept in `_sources/` |
| Notes you typed in Obsidian | Nothing, they are already in the inbox | The same note, with frontmatter added, moved to its unit |
| Notes in Google Docs | Put the doc in your shared Drive folder | Pulled into the inbox as markdown, then filed like a typed note |

What it never does: rewrite the body of a note you typed, or delete a file.

## Setup (once, about 30 minutes)

**Short version.** Install Node.js LTS from nodejs.org, put the vault in Google
Drive, then in Terminal:

```
cd <this school-os folder>
bash setup.sh
```

It installs packages, asks for the vault folder and your keys, writes `.env`,
and runs the first two checks. The long version of the same steps follows.

### 1. Node

Install Node.js LTS from nodejs.org. Then in a terminal:

```
cd school-os
npm install
```

### 2. Put the vault where your phone can reach it

Install **Google Drive for desktop** and let it sync. Create the vault at
`Google Drive/School` (copy `vault-starter/` in as in `docs/PHASE_0_SETUP.md`).
Now the inbox is a Drive folder your phone can save into.

### 3. Genius Scan → inbox

In Genius Scan: scan the pages, tap Export, choose **PDF**, choose **Google
Drive**, pick `School/00 Inbox`. Drive syncs it down to the computer in under a
minute. Name it anything; the brain names the note.

One PDF per class per day is the sweet spot. A 30-page PDF works but costs
more and takes longer.

### 4. `.env`

```
cp .env.example .env
```

Fill in `VAULT_PATH` (the full path to the `School` folder) and
`ANTHROPIC_API_KEY` from platform.claude.com. Leave the Google lines empty for
now.

### 5. First run

```
npm run ingest:fake
```

This pretends to file everything without calling Claude. Check the output
makes sense, then:

```
npm run ingest:dry
```

This calls Claude for real but changes nothing. You see, for each file, the
course, unit, type and confidence it picked, and why. When that looks right:

```
npm run ingest
```

Files move. Open Obsidian and look under `01 Courses`.

## Google Docs (optional, 15 minutes)

1. In Google Cloud Console: new project → APIs & Services → enable
   **Google Drive API** → Credentials → Create **Service account** → Keys →
   Add key → JSON. Save the file as `school-os/service-account.json`
   (it is gitignored).
2. In Google Drive: make a folder called `School Docs`. Share it with the
   service account's email address (it ends in `iam.gserviceaccount.com`),
   Viewer is enough. Copy the folder's ID from the URL (the long string after
   `/folders/`).
3. In `.env`:

   ```
   GDOCS_FOLDER_ID=<that id>
   GOOGLE_SERVICE_ACCOUNT_KEY=./service-account.json
   ```

Every doc in that folder is pulled into the inbox as markdown on the next
`npm run ingest`. If you keep editing a doc after it was filed, the filed note's
body is refreshed in place next run; its frontmatter and location stay.

## Schoology (10 minutes)

In Schoology, click your name → **API**. Copy the consumer key and secret into
`.env` as `SCHOOLOGY_CONSUMER_KEY` and `SCHOOLOGY_CONSUMER_SECRET`. They act
as your account, so they never go anywhere but `.env`. If they ever end up in
a chat or a screenshot, click **Request NEW API Key** and update `.env`.

Then:

```
npm run schoology:whoami   # prints your name and your classes; proves the keys work
npm run schoology:dry      # lists every upcoming item and which ones are new
npm run schoology          # writes 03 Calendar/Upcoming Tests.md
```

Every assignment and event with a due date from today on is pulled from all
your sections. Tests, quizzes and projects are picked out by Schoology's own
"assessment" type and by the words in the title. New or rescheduled ones are
logged, and sent to Discord if `DISCORD_WEBHOOK_URL` is set (Discord: channel
settings → Integrations → Webhooks → copy URL).

Run it as often as you like; it only announces what it has not seen before.

## When the brain is unsure

A note it filed below the confidence threshold stays in `00 Inbox` with
`status: needs-review` and a line in `04 System/Needs Review.md` saying what it
guessed and why. To fix one:

1. Open the note. Change `course:` and `unit:` to the right values, spelled
   exactly as in `_Course.md`.
2. Change `status: needs-review` to `status: organized`.
3. Run `npm run ingest` again. It moves the note (and its scan) without
   calling Claude.

If a unit does not exist yet, add it to that course's `_Course.md` first.

## Commands

| Command | What it does |
|---|---|
| `npm run ingest` | Pull Google Docs, then file everything in the inbox |
| `npm run ingest:dry` | Same, but print the plan and change nothing |
| `npm run ingest:fake` | Dry run with no Claude call, to test the wiring |
| `npm run schoology:whoami` | Check Schoology credentials, list classes |
| `npm run schoology:dry` | Show upcoming items and what is new, write nothing |
| `npm run schoology` | Rewrite Upcoming Tests.md, ping Discord for new tests |
| `npm run typecheck` | Compile check |

## Files

| File | Job |
|---|---|
| `src/ingest.ts` | The loop: for each inbox file, read, classify, file |
| `src/reader.ts` | Turns a PDF, image, Word file or text into what Claude reads |
| `src/classify.ts` | The Claude call and the JSON shape it must return |
| `src/gdocs.ts` | Pulls Google Docs from the shared folder |
| `src/schoology.ts` | Signs requests to the Schoology API with your key and secret |
| `src/sync-schoology.ts` | Upcoming tests from every class, Discord pings |
| `src/vault.ts` | Every read, write and move on the vault |
| `src/config.ts` | `.env` and folder names |

## Costs

Estimated. A one-page scan is a few cents. A ten-page PDF is around 20 to 30
cents. Typed notes and Word files are cheaper because there are no images.
The `ingest:dry` run costs the same as a real run; it is the file moves that
are skipped, not the Claude call.
