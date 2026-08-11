# Build prompt — LevoZ Labs site

Paste everything below the line into Claude Code (Fable). Fill the two blocks marked
**REPLACE** before you run it: the company copy, and the asset paths.

---

You are building the marketing site for **LevoZ Labs**. One page, scroll-driven, cinematic.

## The idea

The whole site is **one continuous walk deeper into a closet**. Scrolling is not scrolling — it is
the camera dollying forward down a lit wardrobe interior. Every so often you arrive at a bay, and a
garment bag swings out from the rail into the centre of frame, clears, and turns out to hold not a
garment but a piece of writing about what this company does.

The joke has to land quietly and only once: it reads as clothing, it resolves as an idea. Never
explain it in copy.

This is a **luxury** register. Slow, heavy, expensive-feeling. Think a fashion house's site, not a
SaaS landing page. No bounce easings, no spring physics, no confetti, nothing playful. If a motion
could be described as "snappy", it is wrong.

## Stack

- Next.js 14+ App Router, TypeScript, Tailwind CSS
- **GSAP + ScrollTrigger** for all scroll-linked motion
- **Lenis** for smooth scroll (not ScrollSmoother — Lenis is MIT and has no membership dependency)
- No other animation library. No Framer Motion. No CSS scroll-timeline (support is still uneven).

Wire Lenis into GSAP's ticker so ScrollTrigger reads Lenis's scroll value, not the native one, and
call `ScrollTrigger.refresh()` after fonts load. Getting this wrong produces drift between the
smooth scroll and the pinned sections, and it is the single most common way this kind of site
breaks.

## The scroll architecture — build this first, before any content

Do **not** build a stack of sections that fade in. Build a corridor.

```
<div class="scene">            perspective: 1400px, perspective-origin centre
  <div class="camera">         one element; ScrollTrigger scrubs its translateZ
    <section class="bay" style="--z: 0">
    <section class="bay" style="--z: -1800">
    <section class="bay" style="--z: -3600">
    ...
```

- Each `.bay` sits at a fixed `translateZ(var(--z))` and never moves.
- **One master ScrollTrigger** scrubs `.camera`'s `translateZ` from 0 to the depth of the last bay,
  `scrub: 1.2`, over the whole page height. That single value is the camera. Everything else keys
  off it.
- Because it is real 3D perspective, near things move faster than far things for free. **You get
  parallax without writing parallax.** Do not hand-author per-layer speeds; let the projection do
  it.
- Each bay has 3 depth planes of its own — back wall, rail plane, garment plane — at small relative
  Z offsets (say -120, 0, +90). That's what gives an individual bay dimensionality as you pass
  through it rather than reading as a flat card.
- Give `.camera` `will-change: transform` and nothing else. Do not put `will-change` on the bays.

**Mobile (< 1024px): abandon the corridor entirely.** Set `perspective: none`, lay the bays out as a
normal vertical flow, and replace the dolly with per-bay fade-and-rise reveals. Same content, same
type, same palette. A 3D corridor on a phone is unreadable and burns battery. Do not attempt a
scaled-down version of it.

## Design language — take these exactly

These are pulled from the existing LevoZ product so the site and the app read as one thing. Use them
verbatim; do not "improve" the palette.

```js
// tailwind.config.ts — extend.colors
room: {
  bg:    "#EDEAE4",  // the seamless backdrop
  panel: "#F7F5F1",  // a surface catching the light
  sunk:  "#E4E0D8",  // a recess
  line:  "#D6D1C7",
  ink:   "#1B1A17",
  muted: "#6F6A62",
  faint: "#9A948B",
},
wardrobe: {
  door:     "#C6C3BC",
  shadow:   "#AFABA3",
  interior: "#DCD3C2",  // warm lit shelf
  rail:     "#9E9A92",  // brushed metal
},
accent: { DEFAULT: "#8A7448", soft: "#B29A6A" },  // restrained brass, emphasis only
```

**Type.** Playfair Display (`next/font/google`) for every heading, at genuinely large sizes —
`clamp(3rem, 7vw, 7rem)` for the hero, `clamp(2rem, 4vw, 3.5rem)` for bay headings. System sans for
body at 15–16px, `leading-relaxed`, and never wider than `65ch`. The contrast between an enormous
serif and small quiet sans is most of the luxury.

**Background.** Not a flat fill — a vignette, fixed:

```css
background-image: radial-gradient(120% 80% at 50% 0%, #f4f2ee 0%, #edeae4 45%, #e3dfd7 100%);
background-attachment: fixed;
```

**The garment bag.** This silhouette is the company's shape. Reuse it as a `clip-path` — tapered
neck, curved shoulders, chamfered hem:

```css
clip-path: polygon(46% 0, 54% 0, 66% 2%, 78% 6%, 89% 12%, 96% 17%, 100% 22%,
                   100% 95%, 96% 100%, 4% 100%, 0 95%, 0 22%,
                   4% 17%, 11% 12%, 22% 6%, 34% 2%);
```

Frost it with `backdrop-filter: blur(3px)` plus this gradient, and outline it with an SVG `<polygon>`
on the same points using `vector-effect="non-scaling-stroke"` — a `clip-path` cuts a border off, and
without an outline several pale bags side by side merge into one white band:

```css
background: linear-gradient(105deg,
  rgba(255,255,255,0.52) 0%, rgba(236,233,227,0.30) 40%,
  rgba(255,255,255,0.44) 64%, rgba(226,222,214,0.50) 100%);
```

Shadows: `0 10px 14px rgba(27,26,23,0.28)` at rest, `0 16px 22px rgba(27,26,23,0.40)` raised.

**Rails.** A 2px `#9E9A92` bar with `0 2px 3px rgba(27,26,23,0.30)` beneath it. Every bag hangs from
a rail by a small hook — a 9%-wide, 7%-tall half-round border, translated up 85% so it sits *over*
the rail, not below it.

## Page structure

### 0 — Hero: the closed wardrobe

Full viewport. The closed wardrobe, centred, lit. One line of Playfair at `clamp(3rem, 7vw, 7rem)`,
and nothing else but a hairline scroll cue that fades out after 4s or on first scroll.

Pin for ~80vh of scroll while the doors part and the camera begins to move in. **This is the one
place a video belongs** — `/closet-building.webm` with an `.mp4` sibling and a poster from the final
frame. WebM first (Chromium builds without proprietary codecs), MP4 second (Safari/iOS won't decode
VP9 in `<video>`). Play it once on entry; do not scrub it with scroll.

Do not stack a headline, a subhead, a paragraph and two buttons here. One line. The restraint is the
pitch.

### 1..N — The bays

Each bay is one idea. As the camera approaches:

1. The bag is hanging on the rail in the distance, frosted, still.
2. At ~35% through the bay's approach it **swings out** from the rail toward centre — rotate on
   `transform-origin: top center`, 3–4° of arc, `translateZ` toward the viewer. Slow.
3. At ~60% the frost clears (`opacity` on the frost layer → 0, `backdrop-filter` blur → 0) and the
   card face resolves.
4. At ~70% the text inside reveals: heading first, then body, then the small caps label — a
   `stagger: 0.08`, each rising `y: 24px` with `opacity`.
5. Past the bay it recedes and re-frosts. **It does not disappear** — you should be able to scroll
   back and find it exactly as it was.

Alternate which side of the rail bags swing from. Give each a deterministic 0.7–1.4° resting tilt
derived from its index (`(i % 2 ? 1 : -1) * (0.7 + (i % 3) * 0.35)`) so they read as hung rather
than pasted, and straighten to 0° when they present.

### Closing bay — the way out

The corridor ends on a lit back wall. One heading, one sentence, one contact action. The camera
comes to rest; nothing further to scroll to. Do not put a fat footer with six columns of links here
— it would undo the whole thing. A single quiet line of legal text, `text-room-faint`, is enough.

## Motion spec — hold to these numbers

| Thing | Value |
|---|---|
| Master camera scrub | `scrub: 1.2` |
| Bay element scrub | `scrub: true`, tied to that bay's own trigger |
| Discrete reveals (non-scrubbed) | `duration: 1.1`, `ease: "power2.out"` |
| Bag swing | `duration: 1.6`, `ease: "power3.inOut"` |
| Text stagger | `0.08` |
| Hover transitions | `220ms`, `ease-out` |
| Cursor lerp | `0.12` per frame |

**No easing that overshoots.** No `back`, no `elastic`, no `bounce`. Anything that overshoots reads
as cheap here, and one instance of it undoes the register of the entire site.

Ambient life: a very slow `sway` on resting bags — `rotate(-0.4deg) → rotate(0.4deg)`, 4.5s,
`ease-in-out`, infinite, offset per bag so they don't move in unison. Barely perceptible. Pause it
on the presenting bag.

## Cursor and hover

- A custom cursor: a 10px `#1B1A17` dot plus a 36px ring at `border-room-line`, the ring following
  by lerp so it trails slightly. Hide the native cursor only on `(hover: hover) and (pointer: fine)`
  — never on touch.
- Over a bag: the ring grows to 64px, drops to `border-accent/40`, and the dot shrinks.
- Over text: the ring collapses to a 2px vertical bar.
- Hovering a resting bag lifts it 6px, straightens the tilt to 0, and deepens the shadow. It does
  **not** open it — opening belongs to scroll alone. Two ways to open the same thing is one too
  many.
- Every interactive element also needs a visible `:focus-visible` ring in `accent`. A custom cursor
  is not a substitute for focus state.

## Non-negotiables

**Accessibility.**
- `prefers-reduced-motion: reduce` → kill Lenis, kill the corridor, kill every scrub. Show all bays
  as a plain readable vertical document. Test this; it must be genuinely usable, not a broken
  version of the real thing.
- Every bay is a `<section>` with a real `<h2>`. The page must make complete sense with CSS
  disabled.
- Keyboard tab order follows the visual order, and focusing an off-screen bay scrolls it into view.
- Contrast: `#6F6A62` on `#EDEAE4` passes AA for body text. `#9A948B` does not — use it only for
  ≥18px or decorative text.

**Performance.**
- Only ever animate `transform` and `opacity`. Never `top`, `left`, `width`, `height`, or
  `box-shadow` on a scrubbed timeline.
- `backdrop-filter` is expensive. At most 3 elements carrying it at once; drop it entirely below
  `lg`.
- Every image `next/image`, sized, `priority` on the hero only.
- Target: LCP under 2.5s on a mid-range phone, and no ScrollTrigger callback over 8ms. If the
  corridor can't hold 60fps on a 2020 MacBook Air, reduce the number of simultaneously visible bays
  before you reduce the quality of the motion.

**Do not:**
- Hijack scroll speed or "snap" to sections. Lenis smooths; it must never take control away.
- Scrub a `<video>` with scroll position.
- Animate anything on page load before the user has scrolled, other than the hero.
- Use a loading screen or a percentage counter. It's a marketing site.
- Add a cookie banner, a chat bubble, or a newsletter modal.

## REPLACE — company copy

Write nothing about LevoZ Labs that isn't given here. If a section is empty, use a clearly-marked
`TODO` placeholder rather than inventing a claim.

```
COMPANY:      LevoZ Labs
ONE LINE:     <the hero line — under 8 words>
BAY 1:        label / heading / 2 sentences
BAY 2:        label / heading / 2 sentences
BAY 3:        label / heading / 2 sentences
BAY 4:        label / heading / 2 sentences
CLOSING:      heading / one sentence / contact action + destination
CONTACT:      levoz.labs@gmail.com
```

One known product, for reference and tone — a men's style recommender: you upload a few pieces you
already like, it reads the style across them, searches real listings in your price range, throws out
everything that doesn't fit, and hangs what's left in a closet you can come back to. Use that as a
bay only if it's meant to be public.

## REPLACE — assets

```
/public/hero-closet.webm + .mp4 + .jpg   the closed wardrobe opening (already exists)
/public/corridor-wall.webp               2560px closet interior plate, for the bay walls
/public/bag-texture-{1,2,3}.webp         optional garment-bag surfaces
/public/dust.webm                        optional 4–6s seamless light-and-dust loop
```

If an asset is missing, render that layer as a CSS gradient in the palette above and carry on. The
site must build and look finished with **zero** external images — treat every asset as an
enhancement, never a dependency.

## Done means

Work through this list explicitly before you say it's finished:

1. Scrolling from top to bottom reads as one continuous move deeper into a space, not as a sequence
   of separate pages.
2. Every bay's bag swings out, clears, presents its text, and re-frosts behind you — and scrolling
   back up reverses it exactly.
3. Nothing overshoots, anywhere.
4. At 390×844 the corridor is gone and the page is a clean, fast, readable stack.
5. With `prefers-reduced-motion: reduce`, the whole site is a legible static document.
6. Tab through the page start to finish without losing the focus ring or getting trapped.
7. No layout shift after fonts load — `ScrollTrigger.refresh()` fires on `document.fonts.ready`.
8. Lighthouse: performance ≥ 90 mobile, accessibility 100.
9. The word "closet" appears in the copy at most once. The metaphor is carried by the motion.

Build it, run it, screenshot the hero, one mid-corridor bay, and the mobile stack, and tell me which
of the nine points above you could not verify.
