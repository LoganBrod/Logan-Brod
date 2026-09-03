# Phase 0 setup

Goal: Obsidian on both devices, the vault laid out, three plugins working, and
a week of real notes in the inbox. No code. About an hour of setup, then just
take notes.

The starter vault is in `school-os/vault-starter/` in this repo.

---

## Step 1 · Install Obsidian (10 min)

- Computer: download from obsidian.md and install.
- iPad: install Obsidian from the App Store.

On the computer, open Obsidian and choose **Create new vault**. Name it
`School`. Put it somewhere you will remember:

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

## Step 3 · Sync to the iPad (10 min)

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

## Step 7 · Find your Schoology calendar feed (5 min)

In Schoology on a browser: **Calendar** → look for an **Export** or
**Calendar feed** button, usually top-right. It shows a URL ending in `.ics`.
Copy it into a note in `04 System/` called `Schoology feed.md`. You will move
it into an `.env` file in Phase 3; for now it just needs to exist.

If there is no export button, your district has turned it off. Write that in
the same note instead. Phase 3 will use the email fallback.

## Step 8 · Take notes for a week

Every class, every day, in Obsidian, in the inbox. The rules:

- **One note per class per day.** Name it `YYYY-MM-DD Topic`, like
  `2026-09-08 Cell membrane`. The date comes first so notes sort.
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

- A note typed on the iPad shows on the computer within a minute, and the
  other way around.
- New notes land in `00 Inbox` with `status: raw` already in them.
- One renamed `_Course.md` per class, units filled in.
- The Schoology feed URL is written down, or its absence is.
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
