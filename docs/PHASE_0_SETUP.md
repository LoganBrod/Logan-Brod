# Phase 0 setup

Goal: Obsidian on the computer, the vault in Google Drive so your phone can
drop scans into it, three plugins working, and a week of real notes and scans
in the inbox. No code. About an hour of setup, then just take notes.

The starter vault is in `school-os/vault-starter/` in this repo.

> **No iPad yet?** Follow the **computer + phone** notes in each step and skip
> Step 3. Paper notes get scanned with Genius Scan on your phone and saved to
> the inbox as PDFs. When an iPad arrives, come back and do Step 3.

---

## Step 1 · Install Obsidian (10 min)

- Computer: download from obsidian.md and install.
- iPad: install Obsidian from the App Store.

**Computer + phone (no iPad):** install **Google Drive for desktop** first and
sign in with your personal Google account. Then in Obsidian choose **Create new
vault**, name it `School`, and put it inside your Google Drive folder. That is
what lets Genius Scan on your phone save straight into the inbox.

**With an iPad:** choose **Create new vault**, name it `School`, and put it
here instead:

| If the computer is | Put the vault at | Sync method later |
|---|---|---|
| a Mac | `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/School` | iCloud, free |
| Windows | `Documents\School` | Obsidian Sync, paid |

On a Mac, that iCloud folder appears once you have opened the Obsidian app
on the iPad at least once and created any vault there with "Store in iCloud"
on. Do that first, then create the vault from the computer in the same folder.

## Step 2 · Copy in the starter vault (5 min)

1. On GitHub, open this repo, switch to branch
   `claude/agentic-school-os-notes-1wr7w3`, click **Code → Download ZIP**.
2. Unzip it. Open `school-os/vault-starter/`.
3. Copy every folder in it into your `School` vault folder. Skip `README.md`.
4. Back in Obsidian, the left sidebar should show `00 Inbox`, `01 Courses`,
   `02 Study`, `03 Calendar`, `04 System`, `_templates`.

## Step 3 · Sync to the iPad (10 min, skip if no iPad)

**Mac + iCloud.** On the iPad open Obsidian, tap **Open folder as vault**, and
pick `School`. It is already there because the folder lives in iCloud. Give it
a minute to download.

**Windows + Obsidian Sync.** Buy Obsidian Sync at obsidian.md/sync. On the
computer: Settings → Sync → log in → **Create new remote vault** → connect it
to `School`. On the iPad: create an empty vault, Settings → Sync → log in →
connect to the same remote vault. Wait for the first sync to finish.

Check: open `04 System/Home.md` on both devices. Same content on both.

## Step 4 · Two Obsidian settings (2 min)

Both on the computer. They sync with the vault.

1. **Settings → Files & Links → Default location for new notes** →
   "In the folder specified below" → `00 Inbox`.
   Every new note from either device now starts in the inbox.
2. **Settings → Files & Links → New link format** → "Shortest path when
   possible". Usually already the default. This is what keeps links working
   when the brain moves notes between folders.

## Step 5 · Plugins (15 min)

Settings → **Community plugins** → Turn on community plugins → Browse. Install
and enable these three. Do it on the computer; the plugins themselves install
on each device, so on the iPad go to the same screen and enable them there too.

### Templater

Settings → Templater:

- **Template folder location:** `_templates`
- **Trigger Templater on new file creation:** on
- Scroll to **Folder templates** → Add new → folder `00 Inbox`, template
  `Class Note`.

Now: press the new-note shortcut. The note should open in `00 Inbox` with
`status: raw` and today's date already in it. If it does not, Templater's
folder template is not set.

### Dataview

Just enable it. Open `04 System/Home.md` in reading view. The "Inbox right
now" table at the bottom should list the example note. That proves Dataview
runs.

### Spaced Repetition

Just enable it. Nothing to configure until Phase 2. It reads flashcards from
notes tagged `#flashcards`.

## Step 6 · Your courses (15 min)

In `01 Courses/` there are two placeholder folders, `Course A` and
`Course B`.

For each real class:

1. Rename the folder to the class name, for example `AP Biology`.
2. Open `_Course.md` inside it. Change `course:` to the same name exactly.
3. Fill in `units:` from the syllabus. Just the ones you know so far.
4. Fill in teacher and period.

Need more courses? Create a folder, then create a note named `_Course` inside
it and apply the `Course` template (Templater: **Insert template** command).
Delete any placeholder folder you did not use.

## Step 7 · Schoology API key (3 min)

In Schoology on a browser: click your name, top right → **API**. It shows a
consumer key and a consumer secret. You will paste them into `school-os/.env`
when you set up the brain. Do not put them in a note, a screenshot, or a
message; they act as your account.

## Step 7b · Genius Scan on your phone (5 min, no iPad)

Install Genius Scan. Scan a page. Tap Export → **PDF** → **Google Drive** →
pick `School/00 Inbox`. Within a minute it appears in the inbox on the
computer. That is your paper-notes pipeline. For Google Docs and Schoology
downloads, see `school-os/README.md`.

## Step 8 · Take notes for a week

Every class, every day, in Obsidian, in the inbox. The rules:

- **One note per class per day.** Name it `YYYY-MM-DD Topic`, like
  `2026-09-08 Cell membrane`. The date comes first so notes sort. Scans can
  be named anything; the brain names the note it writes.
- **Paper notes get scanned the same day**, one PDF per class, into the
  inbox. Write the date at the top of the page and the brain will read it.
- **Write however you write.** Headings, bullets, half sentences, whatever
  you would put on paper. Do not organize. Do not move notes out of the
  inbox. That is the brain's job and it needs raw material to learn from.
- **Homework goes in too.** A note called `2026-09-08 Ch 3 problems` is a
  homework note. Type it up or paste it.
- **Leave the frontmatter alone.** The `status: raw` line is how the brain
  knows a note is untouched.

On the iPad, Apple Pencil Scribble works in any text field, so you can
handwrite and it becomes typed text. Or use the keyboard.

Tick the checklist in `04 System/Home.md` as you go.

---

## Done when

- A Genius Scan PDF saved from the phone shows in the inbox on the computer
  within a minute. (With an iPad: notes sync both ways within a minute.)
- New notes land in `00 Inbox` with `status: raw` already in them.
- One renamed `_Course.md` per class, units filled in.
- You know where the Schoology API page is.
- At least 15 real notes in the inbox.

Then Phase 1 starts: the sorter script, built against those 15 notes.

## If something breaks

- **Notes do not sync.** iCloud: make sure Obsidian on the iPad has
  "Store in iCloud" on, and give iCloud a few minutes after any large copy.
  Obsidian Sync: Settings → Sync shows a status line; "Fully synced" is what
  you want.
- **New note does not get the template.** Templater → Folder templates must
  list `00 Inbox` exactly, and the template must be inside `_templates`.
- **Dataview table shows an error.** Open Home.md in reading view, not
  editing view. If it still fails, the plugin is not enabled on that device.
- **iPad shows old plugin state.** Plugins enable per device. Repeat Step 5
  on the iPad.
