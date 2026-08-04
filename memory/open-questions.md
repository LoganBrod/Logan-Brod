# Open Questions

Things I'm stuck on or need to resolve. Append new questions at the bottom.

To resolve one, change `- [ ]` to `- [x]` and append a `**Resolved:**` line
underneath — don't delete it. A resolved question is evidence of how I think.

Format:

```
- [ ] YYYY-MM-DD — <the question>
  **Context:** why this is blocking or unclear
```

---

- [x] 2026-08-04 — What does Levoz actually do, and who is it for?
  **Context:** The two workstreams named are "growing social media" and
  "building more API." Those are activities, not a product or a customer.
  Blocks writing anything useful in `memory/businesses/levoz.md`.
  **Resolved 2026-08-04:** A listing builder and selling automator for 16–30
  year olds selling/reselling on eBay, Depop and similar platforms.

- [ ] 2026-08-04 — Is Levoz's API the product, or plumbing for the product?
  **Context:** "Building more API" is ambiguous. If Levoz *sells* API access,
  the customer is developers and the bottleneck is probably docs/reliability.
  If it *consumes* APIs, that's internal tooling and the customer is someone
  else entirely. These lead to opposite advice.
  **Update 2026-08-04:** Now that the product is known to be a cross-platform
  listing tool, "integrating with marketplace APIs" is the likely reading —
  but still unconfirmed, so left open.

- [ ] 2026-08-04 — Does Depop actually have a usable listing API?
  **Context:** Claude believes it does not, which would mean automated Depop
  listing requires scraping or browser automation and likely breaches their
  terms. If correct, this is a load-bearing constraint on the whole product,
  not a detail — Depop is named as a launch platform. Needs verifying against
  Depop's current developer docs, not assumed either way.

- [ ] 2026-08-04 — Which eBay API tier is Levoz building against?
  **Context:** Creating listings requires the Sell/Inventory APIs with
  user-delegated OAuth (each seller authorises Levoz on their own account),
  not the app-credential Browse API. Determines the auth architecture and
  makes Levoz responsible for holding other people's marketplace access.

- [ ] 2026-08-04 — How does the under-18 part of the target market hold a
  marketplace account?
  **Context:** Target is 16–30, but eBay and Depop generally require sellers
  to be 18+. Either the real target skews older than stated, or the youngest
  users are selling under a parent's account — which changes onboarding, and
  carries obligations that come with minors as users.

- [ ] 2026-08-04 — What's the relationship between the social media growth and
  the product?
  **Context:** Unclear whether the audience *is* the business (media/creator
  model), a distribution channel for a separate product, or a side activity.

- [ ] 2026-08-04 — What's the division of labour with the co-founder?
  **Context:** Needed before giving any advice about what Logan should stop
  doing — half the answer may be "that's your friend's job."

- [ ] 2026-08-04 — Are there other businesses/projects besides Levoz?
  **Context:** Logan called Levoz "my biggest project," implying others exist.
  The workspace is built for one file per business and currently has one.

- [ ] 2026-08-04 — What did "the branch should be sellz" mean?
  **Context:** Said in the first interview answer. Could mean a git branch
  name, a sub-brand, or the intended public-facing name. Not the same as the
  rename, which is already settled (sellz → Levoz). This session is required
  to push to `claude/personal-assistant-workspace-2tmcfw`, so if a branch
  rename was intended, it needs Logan's explicit say-so.
