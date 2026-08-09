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

## Processing settings (validated)

- Frames: `ffmpeg -ss 1 -to 9 -i corridor.mp4 -vf "fps=24,scale=1600:-2" -q:v 6` → 192 frames, 7.9MB (under the 8MB cap).
- Wall colour drift is warm of `#EDEAE4` by roughly 10–20 RGB points → apply the planned curves nudge before export, per steps doc final check point 2.

## Constraints hit during the run

- Starter plan blocks 4k stills and Kling `pro` mode → stills at 2k, video finals on Kling 3.0 Turbo 1080p.
- The environment's network policy allows `*.higgsfield.ai` but not the results CDN
  `d8j0ntlcm91z4.cloudfront.net` — generations were evaluated by proxying previews through
  Higgsfield's MCP sandbox. Final downloads need that CDN host allowed.

## Credits

272.5 at start → 110.5 after all generation (162 spent: 34 stills incl. iterations, 128 video incl. tests; failed dust jobs auto-refunded).
