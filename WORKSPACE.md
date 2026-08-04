# Personal Assistant Workspace

What this is, for future me.

This folder is the long-term memory for an AI assistant. Claude is the brain;
these files are what it remembers between sessions. A session starts with no
recollection of the last one — everything it knows about me comes from here.

## Where this is going

Logan's stated goal (2026-08-04) is a "Jarvis" — Iron Man's assistant — that
can brainstorm with him, dispatch agents to handle tasks, and surface
information he needs without being asked.

This repo is the memory layer of that, and deliberately only that, for now. An
assistant that forgets everything between sessions cannot be Jarvis regardless
of how capable it is in the moment, so persistent memory comes before agent
orchestration. Order chosen on purpose.

## Why files instead of a database

Because I can read them, `git diff` them, and fix them by hand when they're
wrong. A database would be faster to query and impossible to audit at a glance.
At this size, being able to see the whole memory in a text editor is worth more
than query speed.

## Layout

```
CLAUDE.md              standing context, auto-loaded every session
memory/
  businesses/          one file per business
  decisions.md         append-only: date, decision, reasoning, revisit-by
  open-questions.md    unresolved things
  weekly.md            rolling notes, newest at top
mcp/context-server/    custom MCP server exposing memory/ as tools
dashboard/             placeholder — projector display, later
```

## The two rules that make this work

**1. Append-only.** Nothing in `memory/` is ever overwritten or deleted by a
tool. Notes are only added. The reason is blunt: an assistant with write access
to its own memory can quietly rewrite history, and I'd have no way to notice.
Append-only means the worst a bug can do is add noise — never destroy a note I
can't get back. Corrections are new entries that supersede old ones. Git is the
backstop, not the primary safety net.

**2. Nothing invented.** Everything in `memory/businesses/` came from me saying
it. If Claude doesn't know something, it goes in `open-questions.md` as a
question, not into a business file as a guess. Memory that might be fabricated
is worse than no memory, because I'd trust it.

## Related but separate

This repo also holds `sports-card-tools`, an unrelated Next.js app. See
`README.md`. It shares the repo, not the project.
