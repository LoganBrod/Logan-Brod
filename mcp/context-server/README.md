# context-server

An MCP server that exposes `memory/` to Claude as structured tools, so a
session can search past notes, read business context, and record decisions
without anyone pasting files into the chat.

Built as a first MCP server on purpose: no external API and no OAuth, so the
thing being learned is the protocol itself rather than someone else's auth flow.

## Tools

| Tool | Does | Writes? |
|---|---|---|
| `search_context` | Literal, case-insensitive search across `memory/**/*.md`; returns file and line number | no |
| `get_business` | Returns `memory/businesses/<name>.md` in full | no |
| `list_open_questions` | Unresolved `- [ ]` items from `open-questions.md` | no |
| `log_decision` | Appends a dated decision + reasoning + revisit-by to `decisions.md` | append |
| `add_open_question` | Appends an unresolved question to `open-questions.md` | append |

## Setup

```bash
cd mcp/context-server
npm install
npm run build      # required — build/ is gitignored, so a fresh clone has no build
npm test           # 14 tests, mostly on the path guard and the markdown parser
```

Compiled output is not committed. Build artifacts in git go stale and produce
confusing diffs; the cost is that **cloning is not enough — you must build
before the server will start.**

## Wiring it into Claude Code

`.mcp.json` at the repo root registers it for this project:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["mcp/context-server/build/index.js"]
    }
  }
}
```

Restart Claude Code, then check with `/mcp`. The path is relative so the config
works on any machine; it resolves against the project root.

To point the server at a different memory folder — which is what the tests do —
set `MEMORY_DIR`.

## Design decisions

**stdio transport.** The client launches this file as a child process and
speaks JSON-RPC over its stdin/stdout. No port, no listener, nothing on the
network can reach it, and there is no auth layer to get wrong: the OS process
boundary *is* the security boundary. The consequence that bites people is that
stdout is the wire — anything printed there that is not a JSON-RPC message
corrupts the protocol, so every log line in this server goes to stderr.

**zod on every input.** TypeScript types are erased at compile time and cannot
help here: arguments arrive as JSON from another process, ultimately shaped by
a model. zod validates at runtime and rejects bad calls *before* the handler
runs. It also generates the JSON Schema the client advertises, so the
description written once is what the model sees.

**Append-only, structurally.** `memory.ts` exposes exactly one write function
and it opens with the `"a"` flag. There is no code path in this server that can
truncate a file — not "we avoid calling writeFile", but no way to reach it.
That makes append-only a property of the program rather than a promise.

The reason is not fear of a rogue AI. It is that an assistant able to rewrite
its own memory can quietly revise history, and you would have no way to notice.
With appends only, the worst a bug can do is add noise to the end of a file:
visible, and revertible with git. Corrections are new entries that supersede
old ones, which is also just a better way to keep notes — what you believed in
June is evidence, including when it was wrong.

**Path containment.** `paths.ts` is the entire security boundary and is the
file to read if you read only one. Three layers:

1. `resolveInMemory()` checks containment with `path.relative`, not
   `resolved.startsWith(root)`. The prefix version is a classic bug: with root
   `/home/me/memory`, the string `/home/me/memory-public/x` passes `startsWith`
   while sitting in a different directory.
2. `assertRealPathInside()` calls `realpath` and re-checks, because step 1
   reasons about text. A symlink at `memory/notes.md` pointing at `/etc/passwd`
   is textually inside `memory/` but reads something else.
3. `businessSlug()` allow-lists `[a-z0-9-]`, so a hostile name cannot express
   a path in the first place. Rejecting beats sanitising — sanitising silently
   turns `../../etc` into something that looks legitimate.

**Literal search, not regex.** The query originates from a model. An unanchored
caller-supplied regex is a denial-of-service waiting to happen — input like
`(a+)+$` causes catastrophic backtracking. Matching literally removes the whole
class of problem, and full-text search over a handful of notes does not need
more.

**Empty results say so loudly.** A search miss returns "nothing is recorded —
do not infer an answer", and `get_business` on an unknown name lists what does
exist. A silent empty result invites a model to fill the gap with something
plausible, which is the specific failure this whole workspace exists to avoid.

## Failure cases handled

- `memory/` missing entirely → named error naming `MEMORY_DIR`
- target file missing → recreated with its header on write; explained on read
- file exists but empty → reported as empty, not as absent
- `open-questions.md` with no checklist items → distinguished from "all resolved"
- example items inside ``` fences → skipped, not counted as real questions
- invalid dates like `2026-02-30` → rejected by re-parsing, not just regex
- unreadable file mid-search → skipped, search continues

## Tests

```bash
npm test
```

Covers traversal, absolute paths, the `-public` sibling-prefix case, slug
rejection, and the markdown parser including fenced blocks. `node --test` is
pointed at `build/*.test.js` specifically — aimed at the whole `build/`
directory it picks up `index.js`, starts the server, and hangs forever waiting
on stdin.
