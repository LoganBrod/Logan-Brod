# SellZ — listings that learn

Third sibling of the Brain family (LevoZ clips, AdZ ads): grade your marketplace listings on **real sales outcomes**, learn why items sell — and why the stuck ones don't — research comps, and generate better listings.

## The loop

1. **Set your niche** — what you sell, platforms, shipping, shop style.
2. **Feed the Brain** — import listings with outcomes: the sold ones (sale price, days-to-sell, views/watchers) AND the ones that never moved. Both teach it. Pre-feed reference listings from your niche to bootstrap.
3. **Analyze** — Claude contrasts sold vs stuck: title keywords, pricing vs comps, photos, condition framing. Writes a playbook (listing + pricing guidelines, avoid list), judges running experiments, proposes new ones.
4. **Research comps** — per listing, the Brain searches the web for what comparable items actually sold for and stores a price range + demand notes. Paste your own comps when you have better data.
5. **Diagnose** — for anything not selling: "Why isn't it selling?" contrasts it against your sold listings and comps, explains the problem ranked by impact, and rewrites the title + description with a suggested price.
6. **Generate** — describe an item; get platform-aware drafts (eBay keyword titles vs Depop casual + hashtags) with price, tags, and a photo checklist — Brain-scored and rotating through experiments.
7. **Close the loop** — record outcomes, re-analyze. Every cycle sharpens the next listing.

## Setup

```bash
cd sellz
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) (LevoZ is 3000, AdZ is 3001).

Only `ANTHROPIC_API_KEY` is needed — it powers grading, analysis, comps research (via Claude's web search), diagnosis, and generation.

## Notes

- Data lives in `./data` (gitignored) — your sales numbers stay on your machine.
- The generator/diagnoser never invents brands, sizes, measurements, or condition details you didn't state.
- Comps research depends on what web search can reach; sold-price data is patchy for some categories — the paste-your-own-comps field covers the gap (checking eBay's sold filter yourself takes 30 seconds and is the best data).
