# Levoz

*Formerly called **sellz**. If Logan says "sellz," he means this. Old notes,
repos, and handles may still use the previous name.*

**Status of this file:** partially filled. Sections marked `UNKNOWN` have not
been answered yet — they are questions, not gaps to be guessed at. See
`memory/open-questions.md`.

---

**What it is:** A listing builder and selling automator — it creates listings
and automates the selling process across resale marketplaces (eBay, Depop, and
others).

**Who it's for:** People aged roughly 16–30 who sell or resell items on eBay,
Depop, and similar platforms.

**Stage:** Building. Nothing launched. No users, no revenue.

**Ownership:** Co-founded with a friend. Split, roles, and who decides what:
UNKNOWN.

**Biggest bottleneck right now:** UNKNOWN.

**Already tried, didn't work:** UNKNOWN.

---

## What Logan has said so far

- It is his biggest project and takes the most of his time (as of 2026-08-04).
- Two workstreams he named himself:
  - **Growing social media** — platform, audience, and purpose not yet stated.
    Plausibly the distribution channel, given the 16–30 target, but he has not
    said so.
  - **Building more API** — given the product is a cross-platform listing tool,
    this most likely means *integrating with* marketplace APIs. Not confirmed.

## Constraints worth checking before building further

Raised by Claude on 2026-08-04, not yet confirmed by Logan. These are flagged
because they affect architecture, not because they are known to be true.

- **Depop has no public listing API** (as far as Claude knows). Automated
  listing there may mean scraping or browser automation, which typically
  violates platform terms. If true, "eBay + Depop" are not equal-effort
  integrations and the roadmap should not treat them as such.
- **Creating eBay listings is a different API from searching them.** The Browse
  API is read-only and uses app-level credentials; creating listings needs the
  Sell/Inventory APIs and *user-delegated* OAuth, where each seller authorises
  Levoz against their own account. That is a materially bigger build, and it
  makes Levoz a custodian of other people's marketplace access.
- **The 16–30 age range crosses marketplace age floors.** eBay and Depop
  generally require sellers to be 18+. The under-18 slice of the target market
  may not be able to hold an account in their own name.

## What is deliberately not written here

No business model, pricing, or revenue plan has been recorded — none has been
stated. Nor has the competitive landscape, though this is a category with
established players.
