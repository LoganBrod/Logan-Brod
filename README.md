# Clip Factory

Turn raw gambling-stream footage into ready-to-post vertical clips. Upload a VOD, auto-detect the big moments, cut to 9:16, burn word-by-word captions, and get AI-written hooks and an X caption for every clip.

## Pipeline

1. **Upload** a VOD or session recording (any common video format).
2. **Detect highlights** — scans the audio track for the loudest moments (big wins, reactions) and suggests clip windows.
3. **Cut a clip** — pick start/end (or use a suggestion), choose framing:
   - *Center crop* to 9:16, or
   - *Full frame* over a blurred background.
4. **Captions** — Whisper transcribes the clip and big bold captions are burned in (word-timed chunks).
5. **Hooks + caption** — Claude writes 5 on-screen hook options and a ready-to-post X caption (with an 18+ / gamble-responsibly line), grounded in the transcript plus your notes.
6. **Review + download** — preview the final clip, copy the hook/caption, download the MP4, post it.

## Setup

Runs locally — video processing (ffmpeg) needs a real machine, not serverless.

```bash
cp .env.local.example .env.local   # add your API keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### API keys

| Key | Used for | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Hook + caption writing (Claude) | Recommended — clips still process without it, just no hooks |
| `OPENAI_API_KEY` | Whisper transcription for captions | Optional — without it clips ship uncaptioned |

ffmpeg/ffprobe are bundled via npm (`ffmpeg-static`) — no system install needed.

## Notes

- All videos, clips, and metadata live in `./data` (gitignored).
- Uploads are buffered in memory — fine for VODs up to a couple of GB; split anything bigger.
- Clips are capped at 3 minutes; the sweet spot for X is 15–45 seconds.
- This tool only processes **your own footage**. Posting and (later) X trend analysis are intentionally manual/API-based to stay inside X's terms of service.
