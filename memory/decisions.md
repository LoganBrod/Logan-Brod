# Decisions

Append-only log. Newest entries go at the **bottom**, so the file reads as a
chronology and a diff only ever shows what was added.

Never edit or delete a past entry. If a decision changes, append a new entry
that supersedes it and say so — the point of this file is to preserve what I
believed at the time, including when I was wrong.

Format:

```
## YYYY-MM-DD — <decision in one line>
**Reasoning:** why, including what I traded away
**Revisit by:** YYYY-MM-DD (or "n/a")
```

---

## 2026-08-04 — Assistant workspace lives in the existing Logan-Brod repo, not a new one
**Reasoning:** This repo already held the sports-card-tools Next.js app and had
git history plus a remote. Starting a second repo would split my context across
two places, and `CLAUDE.md` is only auto-loaded from a repo root. Keeping one
root means one auto-loaded memory file. Traded away: the workspace is not
cleanly isolated from unrelated app code.
**Revisit by:** n/a

## 2026-08-04 — The projector dashboard is a separate app, not a route in the sports-card app
**Reasoning:** The existing Next.js app in this repo is deployed to Vercel — it
has a `vercel.json` with a live cron. Adding the dashboard to it would publish
`memory/` to the public internet the next time it deploys: business notes,
decisions, open questions, all of it, on a guessable URL with no auth. Keeping
the dashboard a separate local-only app in `dashboard/` means there is no
deploy pipeline that can leak it, rather than a rule someone has to remember.
Traded away: a second `node_modules` and a second dev server to start.
**Revisit by:** n/a

## 2026-08-04 — Dashboard reads memory/ directly, not through the MCP server
**Reasoning:** MCP servers are launched and driven by MCP *clients* — Claude
Code, Claude Desktop. A web page is not one, so `context-server` cannot simply
be "plugged in" to the dashboard. Making the dashboard an MCP client to read
its own local files would be ceremony for nothing. Both read the same markdown
files; the server exists so Claude can reach them, the dashboard reads them
straight off disk. If the dashboard later needs to *call Claude*, that is the
Claude API plus tools, which is a different integration again.
**Revisit by:** n/a
