# Higgsfield, step by step

Working instructions for producing the LevoZ site assets. Assumes you've generated something on
Higgsfield once and don't yet have a routine.

Prompts live in `levoz-higgsfield-brief.md`. This is the order to run them in and what to do when a
generation comes back wrong.

Higgsfield changes its interface often, so controls below are described by **what they do**. The
label on your screen may differ; the function won't.

---

## Before anything: the one rule that saves your credits

Credits scale with **model × resolution × duration**, and the cost is shown on the Generate button
before you confirm. Resolution is the biggest multiplier of the three.

So: **every prompt gets tested at the lowest resolution and shortest duration first.** You are not
testing whether it looks good — you are testing whether the prompt is aimed correctly. A 720p
5-second test tells you the camera is drifting just as clearly as a 4K one, for a fraction of the
credits.

Only once a prompt has produced a cheap version you'd be happy with do you regenerate it at full
quality. People burn a month of credits in an afternoon by skipping this, generating at max settings
and iterating on the prompt fifteen times.

**Optional, and worth ten minutes:** Higgsfield publishes an MCP server at `higgsfield.ai/mcp`. Connect
it to Claude Code and generations can be driven from the terminal against your existing plan
credits — which means I can run and iterate these prompts directly instead of you copying them by
hand. Add it and tell me, and I'll take over the grind.

---

## Step 1 — Set up the project (10 minutes)

1. Log in and check your credit balance. Note the number; you'll want to know what this cost.
2. Make a folder or project for this work so the outputs don't scatter into your general history.
3. Create a local folder to download into:

```bash
mkdir -p ~/levoz-assets/{raw,final,frames}
```

Download every generation you keep into `raw/` immediately. Higgsfield history is browsable but
you'll be comparing eight near-identical corridor takes, and doing that in a browser tab is
miserable.

---

## Step 2 — The master still (do this before any video)

This is the most important step and the cheapest. Every video shot will reference this image, and
it's what makes six clips look like one closet instead of six.

1. Go to **image generation**. Pick the highest-quality still model available (Nano Banana Pro and
   FLUX.2 are the current strong ones).
2. Paste the **master still prompt** from the brief.
3. Set aspect ratio **16:9**.
4. Generate a batch of 4.
5. Look at them and ask three questions only:
   - Is it **symmetrical**, shot straight on?
   - Is the **centre of frame empty**?
   - Is the palette **warm off-white and pale grey**, not orange, not blue, not white-white?
6. If none pass, adjust the prompt and generate another 4. Expect 3–5 rounds. This is normal, and at
   still-image prices it's cheap.
7. When one is right, **download it to `raw/master.png`**. This image is now the reference for
   everything else.

**Do not move on until you have this.** Every hour spent here saves three later.

### If it keeps coming out wrong

| Problem | Fix |
|---|---|
| Too orange / too golden | Add "neutral white balance, cool cream tones, not golden" |
| Clothes on the rails | Add "the rail is completely empty, no garments" and put clothing in the negative prompt |
| Off-centre or angled | Add "shot dead centre, one-point perspective, perfectly symmetrical" |
| Cluttered, too much detail | Add "minimal, austere, empty" and remove any descriptive nouns you don't need |
| Looks like a shop, not a wardrobe | Remove "walk-in", add "built-in cabinetry, residential" |

---

## Step 3 — Bay plates (4 stills, ~20 minutes)

These are the backgrounds each blurb hangs against. You need 3–4 that differ subtly but share
identical geometry.

1. Still image generation again. Attach `master.png` as a **reference / style image**.
2. Paste the **bay plate prompt** (shot 3 in the brief).
3. Aspect ratio 16:9, largest size available. Stills are cheap — generate these at full resolution.
4. Generate 4.
5. For variations, change **only one clause at a time** — the wall finish, or the light temperature.
   Don't change the composition, the rail height, or the lens.
6. Download the four you like as `raw/bay-1.png` … `bay-4.png`.

**Check:** open all four and confirm the rail sits at the same height in each. If one is noticeably
different, regenerate that one — the site positions garments in fractions of the frame, and a rail
20% lower means blurbs that float in the wrong place on that bay.

---

## Step 4 — The corridor (the hard one, budget an hour)

This is shot 2, the spine of the scroll. It has to be mechanically even, and models resist that.

1. Go to **image-to-video**. Attach `master.png` as the **start frame**.
2. Paste the **corridor prompt** from the brief.
3. Camera motion: if there's a preset library, choose **dolly in / forward dolly**. If there's a
   director overlay that lets you draw a motion path, draw a **straight line into the centre of
   frame** — no curve, no arc.
4. If the camera settings expose lens choice, pick **35mm**. Wider distorts the corridor walls;
   longer flattens the depth you're trying to sell.
5. **Set resolution to the lowest option and duration to the shortest.** This is a test.
6. Generate.
7. Watch it three times, and specifically look for:
   - Does the speed **stay constant**, or does it slow down near the end?
   - Does the **brightness shift** partway through?
   - Do the walls **warp or breathe** as it moves?
   - Does anything **appear** that shouldn't — a person, a garment, a doorway?
8. Adjust and re-test at low resolution until the answer to all four is clean.
9. Only then regenerate at **full resolution, 8–10 seconds**. Generate 3 takes.
10. Compare the three and keep the one with the most even speed. Download as `raw/corridor.mp4`.

### The three failures you will actually hit

**It slows down at the end.** The model is being cinematic at you. Add "constant velocity dolly,
mechanical, no deceleration, the move continues past the end of the clip" and regenerate. If it
persists after two tries, generate a longer clip and cut the last second off in post — the ease-out
lives at the very end, so you can simply not use it.

**The lighting brightens partway.** Add "locked exposure, no lighting changes, no auto-exposure". If
it survives that, fix it in post with a curves adjustment rather than burning more credits.

**The corridor bends or the walls ripple.** Your clip is too long. Video models drift the further
they run. Drop to 5 seconds and generate two segments instead of one long one — the site can play
them back to back and nobody will find the seam on a move this slow.

---

## Step 5 — Hero and end wall (~30 minutes)

Same routine, less pressure — these play normally rather than being scrubbed, so small imperfections
don't matter.

**Hero (shot 1):** you already have a working version at `style/public/closet-building.*`. Only
regenerate if you want it longer or wider. If you do: start frame = a still of the *closed* wardrobe
(generate that first from the master), prompt = shot 1, motion = doors parting plus slow push in.

**End wall (shot 6):** start frame = `master.png`, prompt = shot 6, motion = slow push in. This is
the one clip where deceleration at the end is **correct** — the camera is arriving. Don't fight it.

Test at low res, then one full-res take each. Download to `raw/`.

---

## Step 6 — Dust loop and textures (~20 minutes)

**Dust (shot 5):** text-to-video, no reference image, shortest duration. Generate 4 takes and pick
the one whose start and end look most alike. It doesn't need to loop perfectly — step 7 fixes that.

**Textures (shot 7):** stills, full resolution, one per material — waxed cotton, Shetland wool,
suede, moleskin. These are cheap and fast. Generate 4 and move on; they're decorative.

---

## Step 7 — Process everything (~15 minutes)

You need `ffmpeg`. On a Mac: `brew install ffmpeg`.

```bash
cd ~/levoz-assets

# --- the corridor, as a scrubbable frame sequence ---
ffmpeg -i raw/corridor.mp4 -vf "fps=24,scale=1600:-2" -q:v 6 frames/f_%04d.jpg
du -sh frames/          # must come in under about 8MB

# --- playback clips: two codecs, no audio ---
for name in hero end-wall dust; do
  ffmpeg -i raw/$name.mp4 -an -c:v libvpx-vp9 -crf 32 -b:v 0 final/$name.webm
  ffmpeg -i raw/$name.mp4 -an -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart final/$name.mp4
done

# --- posters, taken from the LAST frame so the still matches where the clip ends ---
ffmpeg -sseof -0.1 -i raw/hero.mp4 -frames:v 1 -q:v 2 final/hero.jpg
ffmpeg -sseof -0.1 -i raw/end-wall.mp4 -frames:v 1 -q:v 2 final/end-wall.jpg

# --- if the dust loop seams visibly, ping-pong it ---
ffmpeg -i raw/dust.mp4 -filter_complex "[0]reverse[r];[0][r]concat" -an final/dust-loop.mp4

# --- stills to WebP ---
for f in raw/bay-*.png raw/texture-*.png; do
  ffmpeg -i "$f" -q:v 82 -vf "scale=2560:-2" "final/$(basename "${f%.*}").webp"
done
```

If `frames/` comes out over 8MB, re-run the first command with `fps=20` before you reduce the width.
On a move this slow the eye forgives a lower frame rate far more readily than it forgives softness.

---

## Step 8 — Hand it to the build

```bash
cp final/* /path/to/levoz-site/public/
cp -r frames /path/to/levoz-site/public/frames
```

Then update the assets block in `levoz-site-prompt.md` to the filenames you actually produced, and
run that prompt in Claude Code.

---

## Rough budget

Plan for roughly:

- **15–25 still generations** (master + bays + textures + a closed-wardrobe frame)
- **12–20 video generations**, of which two-thirds are cheap low-resolution tests
- **6 full-resolution finals**

The corridor alone will account for about half the video spend. That's expected — it's the shot
that has to be right.

Watch the credit cost on the Generate button each time rather than after the fact. If a single
generation is costing an uncomfortable share of your balance, drop the resolution: you are almost
certainly still testing, not finishing.

---

## Final check before you build

1. All four bay plates put the rail at the same height.
2. Sampled wall colour in every still is close to `#EDEAE4` — not orange, not grey-blue.
3. The corridor's first and last frame have the same brightness.
4. Scrubbing the corridor by hand feels even end to end.
5. The centre of every frame is empty enough for two lines of large serif type.
6. `frames/` is under 8MB.

Points 1, 3 and 4 mean regenerate. Point 2 is a curves fix. Point 6 is an ffmpeg re-run.
