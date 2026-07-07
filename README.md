# LevoZ

Turn long footage — streams, sports, podcasts, YouTube videos — into ready-to-post vertical clips. Upload a VOD, find the moments three ways, cut to 9:16, burn word-by-word captions, and get AI-written hooks and a caption for every clip.

## Pipeline

1. **Upload** a VOD, match recording, or podcast (any common video format).
2. **Find moments** — three sources, mix and match:
   - **Loudest moments** — scans the audio track for peaks (crowd roars, big reactions). Free and instant.
   - **AI scan** — transcribes the whole video (Whisper) and has Claude pick the funniest / most hype self-contained moments, each with a description.
   - **Most replayed** — paste the video's YouTube URL and pull YouTube's own viewer heat map peaks.
3. **Cut a clip** — pick start/end (or use a suggestion), choose framing:
   - *Center crop* to 9:16, or
   - *Full frame* over a blurred background.
4. **Captions** — Whisper transcribes the clip and big bold captions are burned in (word-timed chunks).
5. **Hooks + caption** — Claude writes 5 on-screen hook options and a ready-to-post caption, grounded in the transcript plus your notes (adds an 18+ disclosure automatically for gambling content).
6. **Outro card** — a customizable follow screen appended to each clip: headline, your handle/code in your accent color, subline, socials row (Twitch / Kick / YouTube), and an optional footer (add "18+ | Gamble responsibly" for casino content). Configure it on the dashboard, toggle it per clip. When enabled, the main line is also woven into the AI caption.
7. **Review + download** — preview the final clip, copy the hook/caption, download the MP4, post it.

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
- This tool only processes **your own footage**. The Most Replayed feature reads YouTube's public heat map for a video — it never downloads video from YouTube.
