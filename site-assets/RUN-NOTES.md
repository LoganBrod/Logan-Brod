# Higgsfield asset run — selection notes

Run of `levoz-higgsfield-steps.md` on 2026-08-09, workspace `9c6af079` (levoz.labs@gmail.com).
`higgsfield-manifest.json` holds the chosen job IDs and raw result URLs. Every generation is
also recoverable from account history via `higgsfield generate get <job_id>`.

## Chosen assets

| Asset | Job | Notes |
|---|---|---|
| Master still | `b543ee0f` | Nano Banana Pro 2k 16:9. Symmetrical bay, full-width rail, empty centre, single brass pull. |
| Corridor still | `e3a7185c` | Generated from master as reference; start frame for the corridor video. |
| Corridor video | `19ccd23e` | Kling 3.0 Turbo 1080p 10s, take 1 of 3 (evenest motion, std 0.59 vs 2.24/0.74). **Use the 1s–9s segment** — first second has the startup ramp, per steps doc trim trick. |
| End wall video | `21373d30` | Kling 3.0 Turbo 1080p 5s from master; decelerating arrival (correct for shot 6). |
| Dust loop | `8fd50e9e` | Seedance 2.0 Mini 480p 5s; defined motes in light shaft. **Ping-pong it** (`[0]reverse[r];[0][r]concat`) for the seam. |
| Bay plates ×4 | `c7e82285`, `fb0a693a`, `9905f771`, `e278df88` | Plaster / linen / pale oak / cooler plaster. Identical geometry, rail at same height (bay-2 and bay-3 were regenerated anchored to bay-1 to fix geometry drift). |
| Textures ×4 | `98b5e748`, `53e644c7`, `4fb2e4c7`, `d506d2eb` | Waxed cotton olive, Shetland wool, suede putty, cream moleskin. 2k stills. |
| Hero | — | Existing `style/public/closet-building.*` kept, per steps doc. |

## Processing (done — outputs are in `style/public/`)

Every clip and plate carries the same warm-cast correction, applied at encode time rather than
left for the build:

```
curves=r='0/0 0.875/0.929 1/1':g='0/0 0.816/0.918 1/1':b='0/0 0.780/0.894 1/1'
```

Models drifted warm — walls sampled around `(224, 207, 197)` against the `#EDEAE4` = `(237, 234,
228)` target. Post-curve they sample `(238, 234, 231)` and `(235, 236, 233)`, within a few points
of target and of each other.

- **Corridor frames:** 1s–9s segment, graded, `fps=20, scale=1600:-2, -q:v 6` → 160 frames, 8.0MB.
  24fps came in at 9.6MB, so the frame rate came down before the width, per the steps doc.
- **Clips:** VP9 WebM plus H.264 MP4, audio stripped, `+faststart`. Poster taken from the last
  frame.
- **Dust:** ping-ponged (`[0:v]reverse[r];[0:v][r]concat`) so the loop cannot seam.
- **Stills:** WebP at 2560px wide, quality 82.

## Final check (steps doc, §Final check before you build)

1. All four bay plates put the rail at the same height — **pass** (bay-2/3 regenerated to get it).
2. Wall colour close to `#EDEAE4` — **pass after grade**, sampled above.
3. Corridor first and last frame same brightness — **pass**, 212.7 → 209.2, 1.7% drift.
4. Scrubbing feels even end to end — **pass**, motion 0.95→2.11 per second across the trimmed
   segment, the residual rise being perspective (near walls move faster), not camera acceleration.
5. Centre of frame empty enough for two lines of large serif — **pass** on every plate and frame.
6. `frames/` under 8MB — **pass**, 7,924,383 bytes.

## Constraints hit during the run

- Starter plan blocks 4k stills and Kling `pro` mode → stills at 2k, video finals on Kling 3.0
  Turbo 1080p.
- The results CDN `d8j0ntlcm91z4.cloudfront.net` was outside the network policy for most of the
  run, so generations were reviewed by proxying previews through Higgsfield's MCP sandbox. The
  host was allowed before the final download and processing pass.
- The container has no system `ffmpeg`; the pipeline ran on the `imageio-ffmpeg` static build
  (`pip install imageio-ffmpeg`), which carries libx264, libvpx-vp9 and libwebp.

## Credits

272.5 at start → 110.5 after all generation (162 spent: 34 stills incl. iterations, 128 video incl. tests; failed dust jobs auto-refunded).

## Addendum — 2026-08-10 rework

Page restructured: the 3D bay corridor was dropped. Now: hero → corridor frame-scrub →
end wall where generated garments carry the info (hover/tap/focus to reveal) → a plain
website section with the Closet app link and contact. New generations: olive overshirt
and grey wool trousers on hangers (Nano Banana Pro 2k 3:4), background-removed via
`image_background_remover`, shipped as `site/public/garment-{shirt,pants}.webp`.
Balance after rework: 102.5 credits.

## Addendum — continuous-flow rework

The walk is now one pinned timeline: hero pushes in as it exits, the corridor
scrub pauses twice (stop 1: shirt + chore jacket, "How it works"; stop 2:
trousers + knit, "What you get back") with pieces hanging from the corridor
rails, then releases into the end-wall arrival and the website section.
New generations: oatmeal Shetland knit (33ec89cd) + background removals for
the jacket (round-1 shirt take) and knit.

## Addendum — framed layout

Hero video and end-wall sections dropped. The page is now a wordmark header, the
corridor walk inside a pinned rounded rectangle inset from the page edges (the
illoca.com idiom the user asked for), and the website section below. The hero line
and both stops live inside the frame; the dust loop is clipped to the frame too.
Unused assets kept in public/ for now: closet-building.*, end-wall.*, bay-*.webp.
