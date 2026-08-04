# Dashboard

The projector display. A full-screen page that renders what `memory/` knows:
projects, open questions, this week's notes, recent decisions.

Step 2 of the Jarvis build order in [`../WORKSPACE.md`](../WORKSPACE.md).
Display only so far — no voice, no calendar, no hand tracking yet.

## Run it

```bash
cd dashboard
npm install
npm run dev        # http://localhost:3001
```

Port 3001 on purpose: the sports-card app uses 3000, and both may run at once.

Open it on the projector display and press <kbd>F11</kbd> for fullscreen. The
page reloads itself every 60 seconds, so editing a file in `memory/` updates
the wall without touching a keyboard.

## Voice

**Hold space to talk.** Release to get an answer, spoken back.

Push-to-talk rather than a wake word, on purpose: a wall-mounted microphone
that records continuously is a materially different thing to have in your room
than one that records while you hold a key. It also removes wake-word
detection, false triggers from the TV, and any need to stream audio anywhere.

### Speech in — Whisper, locally

Recording, decoding and resampling happen in the browser; transcription runs in
this app's own Node process via `/api/transcribe`. "Server-side" here means
*your machine* — the dashboard is local-only, so audio goes to localhost and no
further.

The split exists because each side has the better tool. The Web Audio API is an
excellent audio decoder that Node lacks without ffmpeg, and Node has the native
ONNX runtime that browsers only have as WebAssembly. It also sidesteps bundling
an ML runtime into the browser, which fights Next's webpack over prebuilt
`.node` binaries.

First request downloads the model (~80 MB from Hugging Face) and caches it.
Everything after that is local and works offline. Override with `WHISPER_MODEL`
— `whisper-small.en` is more accurate and slower, `whisper-tiny.en` the reverse.

Warm it up before first use so the first sentence isn't slow:

```bash
curl localhost:3001/api/transcribe     # {"ready":true,...}
```

### Engines

| URL | Engine | Audio goes to |
|---|---|---|
| default | Whisper, local | your machine only |
| `?speech=web` | Web Speech API | **Google's servers** |
| `?speech=mock` | type instead of talk | nowhere |

Web Speech is the fallback for machines that can't run the model. It is not the
default because "runs in the browser" is not the same as "stays on your
machine" — Chrome streams the audio to Google. The engine in use is shown on
screen for that reason.

`?speech=mock` types instead of talking. It exists so the loop is testable
without a microphone, which is how the states here were verified.

### Speech out

The browser's built-in `speechSynthesis`, using voices already on your OS.
Genuinely local, no download, works offline. Talking over an answer cuts it off
rather than queueing behind it.

### What it can answer

A keyword matcher over `memory/` — projects, open questions, bottlenecks,
recent decisions, the time. **Not a language model.** Anything it doesn't
recognise gets "I can't answer that yet", never an improvised reply.

That restraint is the point. This workspace exists so the assistant doesn't
fabricate things about your businesses, and a voice interface that guessed
would undo it — spoken answers carry more authority than written ones and leave
no transcript to check. Real understanding arrives when the Claude API is
wired in; until then it says what it doesn't know.

## Local only — do not deploy this

There is no auth on this page. It renders business notes, decisions and open
questions to anyone who loads it.

The sports-card app in this repo **is** deployed to Vercel (see `vercel.json`,
which registers a live cron). That is exactly why the dashboard is a separate
app rather than a route inside it: a route would ship `memory/` to a public URL
on the next deploy. Keeping it separate means no pipeline exists that *can*
publish it, rather than a rule someone has to remember not to break.

If it ever does need to be reachable from outside the house, that needs real
auth first, not a hard-to-guess URL.

## How it reads memory

Server components read `../memory/*.md` directly with `fs`. Nothing about the
filesystem reaches the browser.

It does **not** go through the MCP context server, and that is not an
oversight. MCP servers are launched and driven by MCP *clients* — Claude Code,
Claude Desktop. A web page is not one. Making the dashboard an MCP client to
read files sitting next to it would be ceremony for nothing. Both read the same
markdown; the server exists so *Claude* can reach it, the dashboard reads it
straight off disk.

## Designed for a projector, not a monitor

Choices that look odd on a laptop and are deliberate on a wall:

- **Very large type.** Read from across a room, not from 60cm.
- **Dark background, not pure black.** A projector renders `#000` as "no
  light", which against a lit wall reads as muddy grey anyway. A very dark blue
  holds its colour and looks intentional.
- **No scrolling.** `overflow: hidden` on the body. A wall display has no
  scrollbar and nobody to drive it, so anything that does not fit is cut
  deliberately — panels cap their item counts and show a total in the heading
  instead.
- **Cursor hidden.** A mouse pointer parked in the middle of a projection is
  what makes it look like "just a web page".
- **Almost no motion.** One slow pulse on the status dot. Movement in
  peripheral vision is distracting long before it is pretty, and this thing
  sits above a monitor being worked at.

## Known limitations

- The markdown parsing in `lib/memory.ts` duplicates the parser in
  `mcp/context-server/src/memory.ts`. Deliberate for now — sharing it means a
  workspace package between two apps that otherwise have nothing in common.
  Extract it the first time a fix is needed in both.
- Panels truncate rather than paginate. The open-questions heading shows the
  true total, so a cut list never reads as a complete one.
- Refresh is a 60-second poll, not a file watcher. Simple, and good enough for
  notes that change a few times a day.
