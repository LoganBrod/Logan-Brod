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
