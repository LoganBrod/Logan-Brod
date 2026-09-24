# school-os · the brain

Scripts that read your School vault, call Claude, and file your notes. Right
now there is one: `ingest`, the inbox sorter. Drop anything into `00 Inbox`
and it comes out as a markdown note under the right course and unit.

What goes in:

| You have | Do this | It becomes |
|---|---|---|
| Paper notes | Scan with Genius Scan, export as **PDF** into the inbox | A transcribed markdown note, with the PDF kept in `_sources/` |
| A handout or reading on Schoology | Nothing, `npm run materials` pulls it | A markdown copy, original kept in `_sources/` |
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

## Running on its own

```
npm run schedule
```

Installs a background job on this Mac that runs `npm run sync` every 30
minutes while the computer is awake. Output goes to `logs/sync.log`. The
per-run budget still applies, so a big batch spreads across runs.
`npm run unschedule` removes it. Rerun `npm run schedule` after moving the
folder or reinstalling Node.

## Updating

When there is a newer version on GitHub:

```
npm run update
```

Downloads the branch, replaces the code, keeps your `.env` and installed
packages, and reinstalls anything new. No re-downloading ZIPs.

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

**Jarvis and your Docs.** With the same key, the assistant can also list,
search and read your Google Docs live ("pull up my essay draft", "what did I
write in the lab report about friction"). It sees every doc shared with the
service account's email, not just the sync folder, so share a doc or a folder
with that address and it is reachable. On Vercel, set
`GOOGLE_SERVICE_ACCOUNT_KEY` to the whole contents of `service-account.json`
(open the file, copy everything, paste it as the value).

## The Desk

Ask for something to be put on screen ("show me my slope notes", "pull up
the unit 1 deck", "open the essay doc", "write me five practice problems on
this") and it lands on the Desk: a panel of tabs beside whatever page is
open. Notes and Google Docs render as text, flashcard files as a flippable
deck, and the assistant can write its own tabs, like a practice set or a
summary. Tabs stay until you close them, on that phone or computer. A Google
Doc tab has a "Live view" switch to see the real document and a button to
open it in Google Docs.

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

## Units

You do not have to know a course's units up front. Leave `units: []` in its
`_Course.md` and the brain fills it in two ways:

- A **syllabus** or course outline dropped in the inbox writes the unit list
  into `_Course.md`, as long as the list was empty.
- A note that **fits no listed unit** creates one, named `Unit NN - Name`,
  and files itself there. The agent log records every unit it creates.

If it invents a name you dislike, rename the folder, then update the `unit:`
line in `_Course.md`, in that folder's `_Unit.md`, and in the notes inside.

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
| `npm run materials:dry` | List Schoology files it would download |
| `npm run materials` | Download new Schoology files into the inbox |
| `npm run study` | Act on `#make-*` and `#grade-me` tags |
| `npm run plan:dry` | Show the study sessions it would book |
| `npm run plan` | Book study sessions into the Study calendar |
| `npm run brief` | Write today's morning brief |
| `npm run brief:ping` | Send today's brief to your phone again, to test delivery |
| `npm run publish` | Upload a copy of the vault to Vercel, apply what the phone wrote |
| `npm run publish:dry` | Say what `publish` would do |
| `npm run home` | Rewrite `04 System/Home.md` |
| `npm run sync` | Tests, files, ingest, study, plan, brief, home, publish: the daily command |
| `npm run dashboard` | Start the dashboard app at localhost:3210 |
| `npm run schedule` | Run `sync` every 30 minutes in the background (Mac) |
| `npm run unschedule` | Stop the background job |
| `npm run update` | Pull the latest code from GitHub, keeping `.env` |
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
| `src/pull-materials.ts` | Downloads new Schoology files into the inbox |
| `src/generate-study.ts` | Flashcards, practice tests, unit reviews, grading |
| `src/build-home.ts` | The Home dashboard note |
| `src/plan-study.ts` | Books study sessions into Google Calendar |
| `src/brief.ts` | The morning brief |
| `src/phone.ts` | Texts you: iMessage from the Mac, Twilio SMS, or an ntfy push |
| `src/publish.ts` | Copies the vault to Vercel Blob and applies the phone's outbox |
| `dashboard/lib/tools.ts` | What the assistant can do: search and read notes, upcoming work, Google Docs, the Desk, make material, run jobs |
| `dashboard/lib/gdrive.ts` | Live Google Docs search and read through the service account |
| `dashboard/components/Desk.tsx` | The panel of tabs the assistant fills |
| `dashboard/app/api/chat/route.ts` | The assistant's tool loop |
| `dashboard/` | The Next.js dashboard app (reads the vault via `dashboard/lib/vault.ts`) |
| `dashboard/lib/store.ts` | Where the dashboard's files come from: the folder on the Mac, or the copy on Vercel |
| `dashboard/lib/auth.ts`, `dashboard/proxy.ts` | The password login, only when `DASHBOARD_PASSWORD` is set |
| `src/vault.ts` | Every read, write and move on the vault |
| `src/config.ts` | `.env` and folder names |

## The brief on your phone

The morning brief is texted to you as soon as the background job writes it,
the first run after 6 am. Pick one way and put it in `.env`:

**iMessage, free.** The brain runs on your Mac, so it can ask the Messages
app to send the text, the same as if you typed it.

```
PHONE_NUMBER=+15551234567
```

Messages on the Mac has to be signed in with your Apple ID. A message you
send to your own number shows up on the phone as a chat with yourself.

**Twilio, real SMS, about $2 a month.** Sign up at console.twilio.com, verify
your phone number, take the trial number they give you, and copy the Account
SID, Auth Token and that number:

```
PHONE_NUMBER=+15551234567
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...
```

A trial account is enough for one text a day to your own verified number.
Trial texts start with a "Sent from your Twilio trial account" line.

**ntfy, free push notification.** Install the ntfy app on your phone,
subscribe to a topic with a long random name (it is the only thing keeping
strangers out), and put the name in `.env`:

```
NTFY_TOPIC=logan-brief-8f3k2j9x
```

Then test it without spending a Claude call:

```
npm run brief:ping
```

It sends today's brief again and says which way it went. The first iMessage
send makes macOS ask whether Terminal may control Messages: click OK. If
texts arrive when you run that by hand but not from the background job, open
System Settings → Privacy & Security → Automation and switch on whatever it
lists under Messages. Twilio wins when its keys are set, otherwise iMessage;
ntfy goes out as well whenever it is set. `PHONE_CHANNEL=none` turns texts
off without deleting the keys.

## On your phone anywhere (Vercel)

The dashboard, the assistant and Jarvis, from school wifi or anywhere else.
It runs on Vercel's free plan.

How it works: the vault lives on your Mac, and Vercel cannot see your Mac. So
after every sync the brain uploads a private copy of the vault (every note
and system file, no PDFs) to a Vercel Blob store, and the app on Vercel reads
that copy. Anything you do from the phone that writes, like "remember that",
asking for flashcards, or marking the inbox read, lands in a small outbox
that the Mac applies to the real vault on its next sync, then deletes. A
password in front, since it is your schoolwork on a public URL.

**Set up, about 20 minutes, once.**

1. Go to vercel.com and sign up with your GitHub account. Add New → Project
   → Import `Logan-Brod`.
2. Before you deploy, open the project's Settings:
   - **General → Root Directory**: `school-os/dashboard`.
   - **Git → Production Branch**: `claude/agentic-school-os-notes-1wr7w3`
     (the branch this code lives on).
   - **Environment Variables**, add these:
     `ANTHROPIC_API_KEY`, `DASHBOARD_PASSWORD` (make one up, this is the
     site's login), `USER_NAME`, `TZ` (your time zone, e.g.
     `America/New_York`, so "today" is your today), and if you use them
     `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `WAKE_WORD`, `VOICE_NAME`,
     `MODEL_CHAT`, and `GOOGLE_SERVICE_ACCOUNT_KEY` as the contents of
     `service-account.json` if you want Jarvis to reach your Google Docs
     from the phone. Do not add `VAULT_PATH`. Without it the app knows it is on
     Vercel and reads the copy instead of a folder.
3. **Storage → Create Database → Blob**, name it `school-os`, connect it to
   the project. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project by itself.
   Open the store, find that token (the `.env.local` tab shows it) and copy
   it.
4. On the Mac: `npm run update`, then add to `school-os/.env`:

   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```

   and run `npm run publish` once. It says how many files went up. From then
   on `sync` publishes on its own, so the copy is at most 30 minutes behind.
5. Back on Vercel, Deployments → deploy the branch (or ask for a small push).
   Open the URL it gives you, log in with the password, and on the phone use
   Share → Add to Home Screen so it opens like an app.

**What is different on the phone.** Reading, searching, the study pages, the
brief, the assistant and the voice pill all work. Making flashcards from the
phone queues the request; the Mac makes them within 30 minutes. The
assistant cannot run the brain's jobs from there, since they only exist on
the Mac. The wake word works in Chrome on Android; iPhone Safari needs the
pill tapped. Changing the password logs every phone out.

**Costs.** Vercel's Hobby plan is free for personal use and the Blob store's
free allowance is far more than a text vault needs. Claude calls from the
phone cost the same as at home and are logged the same way.

## Costs

Every Claude call is logged to `04 System/costs.jsonl`. See where the money
goes with:

```
npm run costs
```

What keeps it cheap:

- **Typed PDFs never go through vision.** Anything with a text layer (Word
  exports, slides, textbook pages, most of what Schoology serves) is read
  locally for free and only classified, a few hundred output tokens. Only
  true scans, meaning photos of paper, are sent as images and transcribed.
- **Two models.** `MODEL_SORT` (default `claude-sonnet-5`) does sorting and
  transcription. `MODEL_STUDY` (default `claude-opus-5`) writes flashcards,
  tests and reviews, where quality matters. Change either in `.env`.
  `claude-haiku-4-5` is the cheapest option for sorting.
- **A budget per run.** Ingest stops calling Claude once a run has spent
  `MAX_SPEND_PER_RUN` (default $2). The rest of the inbox waits.
- **A page cap on scans.** Scanned PDFs over `MAX_SCAN_PAGES` (default 12)
  are held for you to split rather than sent whole.
- **Dry runs cost the same as real runs.** They call Claude and only skip
  the file moves. Use `--fake` to test wiring for free.

Rough numbers with the defaults: sorting a typed handout is under a cent;
a 3-page handwritten scan is a few cents; a flashcard deck, test or review
for a unit is around 10 to 25 cents.
