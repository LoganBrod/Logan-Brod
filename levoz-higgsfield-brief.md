# Higgsfield asset brief — LevoZ Labs site

Companion to `levoz-site-prompt.md`. That document builds the site; this one produces the footage it
runs on.

The prompts below are written to work in Higgsfield, and equally in Runway, Kling, or Veo — nothing
depends on a feature only one of them has. Generate in whichever gives you the most consistent
interiors.

---

## What you are actually generating

Not "a video of a closet". You are generating **plates that scroll can drive**, which is a narrower
brief with hard rules:

- **Constant camera speed.** Scroll position maps linearly onto frame number. Any ease-in or
  ease-out baked into the footage fights the user's scroll and reads as lag. Ask for a locked,
  mechanical dolly at even speed — no acceleration, no handheld, no drift.
- **No cuts.** One continuous move per clip.
- **Constant exposure.** If the lighting shifts mid-move, every DOM element composited on top stops
  matching. Say "consistent exposure throughout" in every prompt.
- **No text, no people, no hands, no faces.** Text has to be real DOM text — it must stay crisp,
  selectable and indexable, and it has to be editable without regenerating a clip.
- **Leave the middle empty.** The centre of frame is where your blurbs go. Compose so nothing
  important lives there.
- **Short clips.** Video models drift and mutate the longer they run. Six clips of 5–8 seconds hold
  together far better than one of 30, and the site stitches them anyway.

## Pick your approach before you generate

| | How it works | Cost | Verdict |
|---|---|---|---|
| **A. CSS 3D corridor** | No corridor footage at all. Bays are DOM layers at increasing `translateZ`. Higgsfield supplies still plates for walls and textures only. | ~300KB | **Start here.** Perfect scrubbing, crisp text, trivial on mobile. |
| **B. Frame-sequence scrub** | Generate the dolly, decode to JPEGs, paint to `<canvas>` on scroll. | 5–20MB | The cinematic one. Frame-accurate both directions, works on iOS. Use it for the hero only. |
| **C. Scrubbing `<video>`** | Set `currentTime` from scroll. | 2–5MB | **Don't.** Stutters on iOS, seeks unpredictably, and is the reason most of these sites feel broken on a phone. |

Best result is A for the whole page, plus B for the hero moment. Generate for both; you can decide
after you've seen it.

## Rule zero: one master still, then everything references it

Do this before any video prompt. It is the single thing that decides whether your six clips look
like one closet or six different ones.

1. Generate **one still** of the closet interior with the image model until you have one you love.
2. Use that still as the **reference / first-frame image** for every video prompt below.
3. Never regenerate the master to fix a clip. Regenerate the clip.

**Master still prompt:**

> Interior of a luxury walk-in wardrobe, photographed straight on, perfectly symmetrical. Warm
> off-white plaster walls in a soft cream tone, pale grey lacquered cabinetry, a single brushed
> nickel hanging rail running the full width, warm concealed strip lighting along the top of the
> cabinet washing down the back wall. The rail is empty. Polished pale concrete floor. Shot on a
> 35mm lens, f/4, soft diffused light, no hard shadows, gentle vignette. Muted palette: cream,
> warm grey, pale putty, a single small brass detail. Editorial architectural photography, calm and
> expensive. No people, no clothing, no text.

Palette words to keep repeating across every prompt, taken from the product itself: **warm off-white
#EDEAE4, pale grey cabinetry #C6C3BC, warm lit interior #DCD3C2, brushed nickel #9E9A92, restrained
brass #8A7448.**

## The shot list

### 1 — Hero: the wardrobe opens

*Where it goes:* full-screen opening. Plays once on load; never scrubbed.
*Length:* 5–6s · *Motion:* slow push in, doors part

> Static camera facing a closed luxury wardrobe with tall pale grey lacquered doors. The doors slide
> silently apart to reveal a warm lit interior with a single brushed nickel rail. The camera pushes
> in slowly and evenly toward the opening as the doors part. Warm concealed lighting spills out.
> Cream and warm grey palette, soft diffused light, consistent exposure throughout. No people, no
> clothing, no text. Locked tripod, no handheld motion.

You already have a version of this at `style/public/closet-building.*`. Regenerate only if you want
it wider or longer.

### 2 — The corridor (the spine)

*Where it goes:* approach B, the frame-sequence scrub. This is the one that has to be mechanically
perfect.
*Length:* 8–10s · *Motion:* dolly forward, constant speed

> Camera dollies slowly and steadily forward down the centre of a long luxury wardrobe corridor.
> Empty brushed nickel rails run along both walls, receding into the distance. Warm concealed strip
> lighting runs the length of both sides. Walls in warm off-white plaster, cabinetry in pale grey
> lacquer. The corridor continues far beyond the frame. Perfectly centred, symmetrical composition,
> the centre of the frame open and empty. Constant dolly speed with no acceleration or deceleration,
> locked horizon, consistent exposure throughout. Editorial architectural photography, calm and
> expensive. No people, no clothing, no text.

Generate this **three or four times** and keep the one whose speed is most even. This is the shot
where models most often sneak in an ease-out at the end.

### 3 — Bay plate (static)

*Where it goes:* the background of each bay in approach A. Generate 3–4 variations so consecutive
bays aren't identical.
*Length:* still image, 2560px wide

> A single bay of a luxury wardrobe, photographed straight on and perfectly symmetrical. One empty
> brushed nickel rail across the upper third. Warm concealed lighting above washing down a warm
> off-white back wall. Pale grey lacquered side panels framing the bay. The centre of the frame is
> completely empty. 35mm lens, f/4, soft even light, subtle vignette. Cream, warm grey and pale
> putty palette. Architectural interior photography. No people, no clothing, no text.

Variations: change only the lighting temperature slightly, the wall finish (plaster / fine linen /
pale oak), and the rail height. Keep the geometry identical so the DOM garments land in the same
place on all of them.

### 4 — Garment bag swing

*Where it goes:* the moment a bay presents its blurb. Optional — the CSS bag in the site prompt
already does this, and DOM will animate more precisely than footage.
*Length:* 3–4s · *Motion:* the bag rotates out on its hook

> A single translucent garment bag hanging from a brushed nickel rail, seen straight on against a
> plain warm off-white background. The bag swings gently outward toward the camera, rotating from
> the hook at its top. Frosted semi-transparent fabric with a soft sheen, a faint vertical zip line
> down the centre, tapered shoulders and a chamfered hem. Soft even studio light. Slow, weighted
> motion. No people, no text, no logo.

Generate against a flat background so you can key it, or accept a rectangular plate and mask it with
the site's `clip-path`.

### 5 — Ambient dust and light

*Where it goes:* an overlay across the whole page at 10–15% opacity, `mix-blend-mode: screen`. Adds
air. Must be seamless.
*Length:* 4–6s, loopable

> Fine dust motes drifting slowly through a warm shaft of light against a dark neutral background.
> Very slow, gentle, ambient motion. Shallow depth of field. Nothing else in frame. Seamless loop,
> first and last frame identical. No people, no objects, no text.

If it doesn't loop cleanly, fix it in post: `ffmpeg -i dust.mp4 -filter_complex "[0]reverse[r];[0][r]concat" loop.mp4` gives you a ping-pong that always seams.

### 6 — The end wall

*Where it goes:* the closing bay, where the camera comes to rest.
*Length:* 4–5s · *Motion:* slow push in, settling to a stop

> Camera moves slowly forward toward the end wall of a luxury wardrobe corridor and comes gently to
> rest. The wall is warm off-white plaster, lit from above by a soft warm glow. A single empty
> brushed nickel rail sits across it. Symmetrical, centred, the middle of the frame empty. Motion
> decelerating smoothly to a complete stop. Consistent exposure. No people, no clothing, no text.

This is the one shot where an ease-out is *correct* — the camera is arriving, not scrubbing.

### 7 — Texture macros (stills, optional)

Three or four, for section transitions and hover reveals.

> Extreme close-up of waxed cotton fabric in olive, raking side light, visible weave and a soft
> sheen, shallow depth of field, muted natural palette, editorial product photography, no text.

Swap the material each time: waxed cotton, Shetland wool, suede, brushed moleskin.

## Say no to these, every time

Append to every prompt, or put in the negative field if there is one:

> No people, no hands, no faces, no mannequins, no clothing on the rails, no text, no watermarks,
> no logos, no lens flare, no light leaks, no exposure changes, no camera shake, no handheld motion,
> no zoom, no cuts, no colour grading shifts, no oversaturation.

Three that ruin scroll footage specifically and that models add unasked: **camera shake**, **an
ease-out at the end of the move**, and **a lighting change partway through**.

## Post-processing

Generate at the largest size available, 16:9. Then:

**For the frame-sequence scrub (approach B):**

```bash
# 24fps at 1600px wide is the sweet spot — smooth, and JPEG artefacts invisible at f/4 softness
ffmpeg -i corridor.mp4 -vf "fps=24,scale=1600:-2" -q:v 6 frames/f_%04d.jpg

# check the weight before you commit to it
du -sh frames/
```

Aim for **under 8MB total**. If you're over, drop to 20fps before you drop resolution — the eye
forgives a lower frame rate on a slow move far more readily than it forgives softness.

**For playback clips (hero, ambient, end wall):**

```bash
# strip audio, two codecs — WebM first for Chromium builds without proprietary codecs,
# MP4 for Safari and iOS which won't decode VP9 in <video>
ffmpeg -i hero.mp4 -an -c:v libvpx-vp9 -crf 32 -b:v 0 hero.webm
ffmpeg -i hero.mp4 -an -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart hero.mp4

# poster from the final frame, so the still matches where the clip ends
ffmpeg -sseof -0.1 -i hero.mp4 -frames:v 1 -q:v 2 hero.jpg
```

**For stills:** export WebP at 2560px wide, quality 82. Check it against the palette above — models
drift warm, and a plate that's noticeably more orange than `#EDEAE4` will fight every DOM element
sitting on it.

## Plugging it into the site

Replace the assets block in `levoz-site-prompt.md` with what you actually produced:

```
/public/hero-closet.{webm,mp4,jpg}      shot 1
/public/frames/f_0001.jpg … f_0240.jpg  shot 2, if using approach B
/public/bay-{1,2,3,4}.webp              shot 3
/public/dust.webm                       shot 5
/public/end-wall.{webm,mp4,jpg}         shot 6
/public/texture-{1,2,3}.webp            shot 7
```

Then add this to the prompt so Fable builds the scrubber correctly:

> The hero uses a frame-sequence scrubber, not a video element. Preload the frames into an array of
> `Image` objects, draw the current one to a `<canvas>` sized with `devicePixelRatio`, and map the
> hero's ScrollTrigger progress onto the frame index. Never call `video.currentTime`. Show the first
> frame as a static image until preloading finishes, and skip the sequence entirely below `lg` and
> under `prefers-reduced-motion` — show the poster instead.

## Before you call the footage done

1. Scrub shot 2 back and forth by hand. Does the speed feel even, or does it slow at one end?
2. Freeze the first and last frame of shot 2 side by side. Is the exposure the same?
3. Is the centre of every frame empty enough to put two lines of Playfair over it?
4. Does the dust loop seam invisibly when played end to end?
5. Do all four bay plates put the rail at the same height?
6. Sample the wall colour in each plate. Are they within a few points of each other and of `#EDEAE4`?

Failing 1 or 2 means regenerate. Failing 6 is fixable with a curves adjustment; do it before you
build, not after.
