# LevoZ Labs — marketing site

One page, scroll-driven: the whole site is one continuous walk deeper into a closet.
Built from `site-assets/levoz-site-prompt` spec with the Higgsfield-generated footage
(see `site-assets/RUN-NOTES.md` for how every asset was made).

## The one thing left to do

**The copy.** Every word the site says lives in `lib/copy.ts`, currently as visible
`TODO` placeholders: the hero line (under 8 words), four bays (label / heading / two
sentences), and the closing. Replace the strings; nothing else needs touching.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy (Vercel)

This directory is a self-contained Next.js app inside the repo:

1. vercel.com → Add New → Project → import `LoganBrod/Logan-Brod`
2. Set **Root Directory** to `site` (critical — the repo root is a different app)
3. Framework preset: Next.js, defaults everywhere else
4. After the first deploy, add `levozlabs.com` under Domains and follow the DNS
   instructions it gives you

## How it's put together

- `app/components/SmoothScroll.tsx` — Lenis wired into GSAP's ticker (one rAF loop)
- `app/components/Hero.tsx` — the wardrobe opens, plays once, never scrubbed
- `app/components/FrameScrubber.tsx` — the corridor walk: 160 preloaded JPEGs painted
  to a canvas from scroll progress; poster below `lg` and under reduced motion
- `app/components/Corridor.tsx` — real 3D corridor: fixed bays, one scrubbed camera;
  parallax comes from the projection, not per-layer speeds
- `app/components/GarmentBag.tsx` — the company's silhouette as a clip-path
- `app/components/ClosingBay.tsx` — the end wall, decelerating to rest
- Below 1024px the corridor is abandoned for a vertical stack, and
  `prefers-reduced-motion` turns the whole page into a plain document.
