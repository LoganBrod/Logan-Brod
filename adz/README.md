# AdZ — ads that learn

Sister project to LevoZ, same brain, pivoted to advertising: grade your ads on **real performance** (CTR, purchase rate, ROAS), learn what actually converts for your audience, and **generate the next creatives** — copy, images, and assembled video ads — from the winning patterns.

## The loop

1. **Set your product** — what you sell, who it's for, the offer, your voice. Everything is anchored to it.
2. **Feed the Brain** — import past ads with their numbers (impressions, clicks, spend, purchases, revenue → CTR/CVR/ROAS derived automatically), and/or pre-feed reference ads from your niche.
3. **Analyze** — Claude finds what correlates with conversions (not just clicks), writes a playbook (creative guidelines, visual guidelines, what to avoid), judges running experiments against control, and proposes the next A/B tests.
4. **Generate** — new ad drafts follow the playbook: headline, primary text, CTA, and visuals. Image ads get an AI-generated visual; video ads get a scene-by-scene script turned into a real 9:16 video — generated scene images, ken-burns motion, timed text overlays, and an AI voiceover.
5. **Grade** — every draft gets a Brain score (0–100) with a reason and the single highest-impact fix, sorted best-first.
6. **Close the loop** — run the ads, punch the numbers back in, re-analyze. Each cycle sharpens the playbook, and generated ads rotate through the Brain's proposed experiments automatically.

## Setup

```bash
cd adz
cp .env.local.example .env.local   # add your API keys
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (runs alongside LevoZ on 3000).

| Key | Used for | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Grading, analysis, experiments, ad copy generation | Yes — it's the Brain |
| `OPENAI_API_KEY` | Image generation + video voiceovers | Only for visual/video assets |

## Notes

- All data lives in `./data` (gitignored). No accounts, no tracking — your ad numbers stay on your machine.
- Generated visuals are intentionally text-free; headlines/overlays are added separately so the copy stays editable.
- The generator never invents claims, discounts, or testimonials — it only works from the product/offer you set.
- Rough asset costs: ~$0.10–0.25 per generated image, video ads ~$0.50–1 (3–4 scene images + voiceover).
