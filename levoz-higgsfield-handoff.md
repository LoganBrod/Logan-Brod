# LevoZ Labs — Higgsfield asset production

Self-contained handoff. Everything needed to produce the footage for the LevoZ Labs site is in this
one file; it references no other document and assumes no prior context.

**Deliverable:** a set of plates and clips for a scroll-driven marketing site whose whole conceit is
walking deeper into a closet, with blurbs about the company presenting themselves as you go.

---

## 0. What you are actually generating

Not "video of a closet" — **plates that scroll can drive**. That is a narrower brief with hard
rules, and footage that breaks them is unusable however good it looks:

- **Constant camera speed.** Scroll position maps linearly onto frame number. An ease-in or ease-out
  baked into the footage fights the user's scroll and reads as the page lagging. Ask for a locked,
  mechanical dolly at even speed — no acceleration, no handheld, no drift.
- **No cuts.** One continuous move per clip.
- **Constant exposure.** If lighting shifts mid-move, every element composited on top stops matching.
- **No text, no people, no hands, no faces.** All text is real DOM text on the site — it has to stay
  crisp, selectable and indexable, and editable without regenerating a clip.
- **Leave the centre of frame empty.** That's where the writing goes.
- **Short clips.** Video models drift and mutate the longer they run. Six clips of 5–8 seconds hold
  together far better than one of 30, and the site stitches them anyway.

### How the footage gets used

| Approach | How it works | Weight | Verdict |
|---|---|---|---|
| **CSS 3D corridor** | No corridor footage. Depth is DOM layers at increasing `translateZ`. Stills only. | ~300KB | **Default.** Perfect scrubbing, crisp text, trivial on mobile. |
| **Frame-sequence scrub** | Decode the dolly to JPEGs, paint to `<canvas>` on scroll. | 5–20MB | The cinematic one. Frame-accurate both directions, works on iOS. Hero only. |
| **Scrubbing `<video>`** | Set `currentTime` from scroll. | 2–5MB | **Don't.** Stutters on iOS, seeks unpredictably. |

Generate for the first two. Decide after you've seen them.

---

## 1. Setup

### Option A — MCP connector (fewer moving parts)

Higgsfield publishes an MCP server at `higgsfield.ai/mcp`. Connector traffic travels through
Anthropic's servers rather than the session's own network, so it works regardless of the
environment's domain allowlist and survives new sessions with no reinstalling. If it's available,
use it and skip option B.

### Option B — CLI

```bash
npm i -g @higgsfield/cli
higgsfield auth login
higgsfield account status     # check the balance before spending
```

**If you are in a remote container, `auth login` will not complete on its own.** It runs an OAuth
PKCE flow with a loopback redirect to `localhost:8765`, and there is no browser in the container.
The working relay:

1. Run `higgsfield auth login` — **without `--port`**. Only certain ports are pre-registered with
   the OAuth client; an invented one fails with `redirect_uri does not match any of the OAuth 2.0
   Client's pre-registered redirect urls`.
2. Print the authorization URL it emits and hand it to the human.
3. They sign in; the browser lands on a page that **fails to load**. That's expected.
4. They paste back that page's full address, `http://localhost:8765/callback?code=...&state=...`.
5. `curl` that URL against the container's listener. The code verifier lives there, so the exchange
   completes locally.

**Do not probe the callback endpoint to check the listener is alive.** Hitting `/callback` without
the parameters consumes the state and kills the flow with `invalid state`, and you have to start
over. Learned the hard way.

Also note the container's egress policy must allow `higgsfield.ai` and `*.higgsfield.ai`. A `403` on
CONNECT means the domain isn't allowlisted for that environment — that's configuration, not
something to route around.

### Credit discipline — read before generating anything

Credits scale with **model × resolution × duration**, and the cost is shown before you confirm.
Resolution is the biggest multiplier.

**Every prompt gets tested at the lowest resolution and shortest duration first.** You are not
testing whether it looks beautiful — you are testing whether the prompt is aimed correctly. A cheap
720p 5-second version shows a drifting camera exactly as clearly as an expensive one. Only once a
cheap version is right do you regenerate at full quality.

Skipping this is how a month of credits disappears in an afternoon.

---

## 2. Rule zero: one master still, then everything references it

Do this before any video prompt. It is the single thing that decides whether six clips look like one
closet or six different ones.

1. Generate **one still** of the closet interior. Iterate here — stills are cheap.
2. Use it as the **reference / first-frame image** for every video prompt below.
3. Never regenerate the master to fix a clip. Regenerate the clip.

**Master still prompt:**

> Interior of a luxury walk-in wardrobe, photographed straight on, perfectly symmetrical. Warm
> off-white plaster walls in a soft cream tone, pale grey lacquered cabinetry, a single brushed
> nickel hanging rail running the full width, warm concealed strip lighting along the top of the
> cabinet washing down the back wall. The rail is empty. Polished pale concrete floor. Shot on a
> 35mm lens, f/4, soft diffused light, no hard shadows, gentle vignette. Muted palette: cream, warm
> grey, pale putty, a single small brass detail. Editorial architectural photography, calm and
> expensive. No people, no clothing, no text.

Judge each candidate on three questions only:

- Is it **symmetrical**, shot straight on?
- Is the **centre of frame empty**?
- Is the palette **warm off-white and pale grey** — not orange, not blue, not white-white?

Expect 3–5 rounds. Don't move on without it.

### When the still keeps coming out wrong

| Problem | Fix |
|---|---|
| Too orange / golden | Add "neutral white balance, cool cream tones, not golden" |
| Clothes on the rails | Add "the rail is completely empty, no garments"; put clothing in the negative |
| Off-centre or angled | Add "shot dead centre, one-point perspective, perfectly symmetrical" |
| Cluttered | Add "minimal, austere, empty"; delete descriptive nouns you don't need |
| Reads as a shop | Remove "walk-in", add "built-in cabinetry, residential" |

### The palette, in words

Taken from the LevoZ product itself so the site and the app read as one thing. Repeat these across
every prompt: **warm off-white `#EDEAE4`, pale grey cabinetry `#C6C3BC`, warm lit interior
`#DCD3C2`, brushed nickel `#9E9A92`, restrained brass `#8A7448`.**

---

## 3. The shot list

### 1 — Hero: the wardrobe opens
*Full-screen opening. Plays once on load; never scrubbed. 5–6s, slow push in as doors part.*

> Static camera facing a closed luxury wardrobe with tall pale grey lacquered doors. The doors slide
> silently apart to reveal a warm lit interior with a single brushed nickel rail. The camera pushes
> in slowly and evenly toward the opening as the doors part. Warm concealed lighting spills out.
> Cream and warm grey palette, soft diffused light, consistent exposure throughout. No people, no
> clothing, no text. Locked tripod, no handheld motion.

### 2 — The corridor (the spine)
*The frame-sequence scrub. This is the one that has to be mechanically perfect. 8–10s, dolly
forward at constant speed.*

> Camera dollies slowly and steadily forward down the centre of a long luxury wardrobe corridor.
> Empty brushed nickel rails run along both walls, receding into the distance. Warm concealed strip
> lighting runs the length of both sides. Walls in warm off-white plaster, cabinetry in pale grey
> lacquer. The corridor continues far beyond the frame. Perfectly centred, symmetrical composition,
> the centre of the frame open and empty. Constant dolly speed with no acceleration or deceleration,
> locked horizon, consistent exposure throughout. Editorial architectural photography, calm and
> expensive. No people, no clothing, no text.

Generate **three or four takes** and keep the one whose speed is most even. This is the shot where
models most often sneak in an ease-out at the end.

### 3 — Bay plate (still)
*Background for each section. Generate 3–4 variations. 2560px wide.*

> A single bay of a luxury wardrobe, photographed straight on and perfectly symmetrical. One empty
> brushed nickel rail across the upper third. Warm concealed lighting above washing down a warm
> off-white back wall. Pale grey lacquered side panels framing the bay. The centre of the frame is
> completely empty. 35mm lens, f/4, soft even light, subtle vignette. Cream, warm grey and pale
> putty palette. Architectural interior photography. No people, no clothing, no text.

For variations change **one clause at a time** — wall finish (plaster / fine linen / pale oak), or
light temperature. Keep geometry identical: the site positions elements in fractions of the frame,
so a rail 20% lower means content floating in the wrong place on that bay.

### 4 — Garment bag swing (optional)
*The moment a section presents itself. Optional — CSS animates this more precisely than footage
will. 3–4s.*

> A single translucent garment bag hanging from a brushed nickel rail, seen straight on against a
> plain warm off-white background. The bag swings gently outward toward the camera, rotating from
> the hook at its top. Frosted semi-transparent fabric with a soft sheen, a faint vertical zip line
> down the centre, tapered shoulders and a chamfered hem. Soft even studio light. Slow, weighted
> motion. No people, no text, no logo.

Generate against a flat background so it can be keyed.

### 5 — Ambient dust and light
*Page-wide overlay at 10–15% opacity, `mix-blend-mode: screen`. Must loop. 4–6s.*

> Fine dust motes drifting slowly through a warm shaft of light against a dark neutral background.
> Very slow, gentle, ambient motion. Shallow depth of field. Nothing else in frame. Seamless loop,
> first and last frame identical. No people, no objects, no text.

### 6 — The end wall
*The closing section, camera coming to rest. 4–5s.*

> Camera moves slowly forward toward the end wall of a luxury wardrobe corridor and comes gently to
> rest. The wall is warm off-white plaster, lit from above by a soft warm glow. A single empty
> brushed nickel rail sits across it. Symmetrical, centred, the middle of the frame empty. Motion
> decelerating smoothly to a complete stop. Consistent exposure. No people, no clothing, no text.

This is the **one** shot where an ease-out is correct. The camera is arriving, not scrubbing.

### 7 — Texture macros (stills, optional)
*Three or four, for transitions and hover reveals. Swap the material each time: waxed cotton,
Shetland wool, suede, brushed moleskin.*

> Extreme close-up of waxed cotton fabric in olive, raking side light, visible weave and a soft
> sheen, shallow depth of field, muted natural palette, editorial product photography, no text.

---

## 4. Negative prompt — append to every generation

> No people, no hands, no faces, no mannequins, no clothing on the rails, no text, no watermarks, no
> logos, no lens flare, no light leaks, no exposure changes, no camera shake, no handheld motion, no
> zoom, no cuts, no colour grading shifts, no oversaturation.

Three ruin scroll footage specifically, and models add all three unasked: **camera shake**, **an
ease-out at the end of the move**, and **a lighting change partway through**.

---

## 5. Order of work

1. **Master still** — iterate until right. Everything references it.
2. **Bay plates** — 3–4 stills, full resolution, identical geometry.
3. **Corridor** — low-res tests until the move is even, then 3 full-res takes. Budget an hour;
   this is roughly half the video spend.
4. **Hero and end wall** — low-res test, then one full-res take each.
5. **Dust and textures** — quick, decorative.
6. **Process** — section 6 below.

### The three corridor failures you will hit

**It slows down at the end.** The model is being cinematic at you. Add "constant velocity dolly,
mechanical, no deceleration, the move continues past the end of the clip". If it persists after two
tries, generate longer and cut the last second off — the ease-out lives entirely at the end.

**Lighting brightens partway.** Add "locked exposure, no lighting changes, no auto-exposure". If it
survives that, fix it with a curves adjustment rather than more credits.

**The corridor bends or walls ripple.** The clip is too long. Drop to 5 seconds and generate two
segments; on a move this slow nobody finds the seam.

---

## 6. Post-processing

Generate at the largest size available, 16:9. Then:

```bash
# --- corridor as a scrubbable frame sequence ---
ffmpeg -i corridor.mp4 -vf "fps=24,scale=1600:-2" -q:v 6 frames/f_%04d.jpg
du -sh frames/            # must come in under about 8MB

# --- playback clips: no audio, two codecs ---
# WebM first for Chromium builds without proprietary codecs; MP4 for Safari and
# iOS, which won't decode VP9 in <video>
for name in hero end-wall dust; do
  ffmpeg -i $name.mp4 -an -c:v libvpx-vp9 -crf 32 -b:v 0 final/$name.webm
  ffmpeg -i $name.mp4 -an -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart final/$name.mp4
done

# --- posters from the LAST frame, so the still matches where the clip ends ---
ffmpeg -sseof -0.1 -i hero.mp4 -frames:v 1 -q:v 2 final/hero.jpg

# --- ping-pong the dust if it doesn't seam cleanly ---
ffmpeg -i dust.mp4 -filter_complex "[0]reverse[r];[0][r]concat" -an final/dust-loop.mp4

# --- stills to WebP ---
ffmpeg -i bay-1.png -q:v 82 -vf "scale=2560:-2" final/bay-1.webp
```

If `frames/` exceeds 8MB, drop to `fps=20` **before** reducing width — on a move this slow the eye
forgives a lower frame rate far more readily than softness.

Sample the wall colour in each still and compare against `#EDEAE4`. Models drift warm, and a plate
noticeably more orange will fight every element sitting on it. Fix with curves before anything is
built on it.

---

## 7. Delivered filenames

```
hero-closet.{webm,mp4,jpg}       shot 1
frames/f_0001.jpg … f_0240.jpg   shot 2, frame-sequence scrub
bay-{1,2,3,4}.webp               shot 3
bag-swing.{webm,mp4}             shot 4, optional
dust.webm                        shot 5
end-wall.{webm,mp4,jpg}          shot 6
texture-{1,2,3}.webp             shot 7
```

If any asset is missing, the site renders that layer as a CSS gradient in the palette above. Every
asset here is an enhancement, never a dependency — the site must build and look finished with none
of them.

---

## 8. Before calling it done

1. Scrub the corridor back and forth by hand. Is the speed even, or does it slow at one end?
2. Freeze its first and last frame side by side. Same exposure?
3. Is the centre of every frame empty enough for two lines of large serif type?
4. Does the dust loop seam invisibly played end to end?
5. Do all bay plates put the rail at the same height?
6. Sampled wall colour within a few points of `#EDEAE4` across every plate?
7. Is `frames/` under 8MB?

Failing 1, 2 or 5 means regenerate. 6 is a curves fix. 7 is an ffmpeg re-run.
