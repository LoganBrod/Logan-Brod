# LevoZ

Turn long footage — streams, sports, podcasts, YouTube videos — into ready-to-post vertical clips. Upload a VOD, find the moments three ways, cut to 9:16, burn word-by-word captions, and get AI-written hooks and a caption for every clip.

## Two modes

- **Library** — upload files (VODs, match recordings, podcasts) and clip them, YouTube-style.
- **Live** — point it at a Kick stream (channel name, or any HLS .m3u8 URL). It records, learns the stream's normal loudness, and auto-clips moments that spike above it — full pipeline included (captions, hooks, outro). Clips land in the queue as they happen; with auto-post on, they go straight to X.

## The learning loop

Post clips, record their numbers (typed in on each clip card, or fetched from the X API), then hit **Analyze performance** on the dashboard. Claude finds the patterns — which moment types, lengths, and hook styles perform — and writes a playbook that is fed back into the AI moment scanner, the live clipper's picks, and the hook writer. The more clips you rate, the sharper it gets.

**Brain scores.** Every finished clip gets a 0–100 performance prediction judged against the playbook, with a one-line reason. Clips sort by score, and you can set an auto-post bar ("only auto-post clips scoring ≥ 70") — anything below waits in the queue for your call. Rescore any clip after the playbook updates.

**Experiments.** Each analysis also proposes up to 3 A/B experiments ("question hooks beat statement hooks?"). New clips rotate between variants and a control group automatically — variant clips get the experiment's instruction applied to their hooks/captions and a 🧪 tag. The next analysis compares the numbers, declares winners, folds them into the playbook, and proposes fresh experiments. That's the self-evolving part: it doesn't just learn from what you did, it decides what to try next.

**Pre-feeding.** Cold start? Open "Pre-feed the Brain" on the dashboard and describe 3+ viral clips you want to emulate (what happens, the hook, rough view counts). Analyze builds a starter playbook from those references alone — scoring, hooks, and moment picking all work from day one. As your own posted clips accumulate real numbers, they automatically outweigh the references.

## Posting

Clips wait in the queue for approval by default. Add X API keys (developer.x.com, free tier, Read+Write) to `.env.local` to post from the clip card — or flip on **Auto-post** to have finished clips posted automatically. Views/likes/reposts are stored per clip and feed the learning loop.

## Library pipeline

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
