# Dashboard

The projector display. A full-screen page that renders what `memory/` knows:
projects, open questions, this week's notes, recent decisions.

Step 2 of the Jarvis build order in [`../WORKSPACE.md`](../WORKSPACE.md).
Display only so far — no voice, no calendar, no hand tracking yet.

## Run it

Needs Node 18.17 or newer (`node --version`).

```bash
git clone https://github.com/LoganBrod/Logan-Brod.git
cd Logan-Brod
git checkout claude/personal-assistant-workspace-2tmcfw

cd dashboard
npm install
npm run dev                              # http://localhost:3001
curl http://localhost:3001/api/transcribe   # warms Whisper, ~80 MB first time
```

Port 3001 on purpose: the sports-card app uses 3000, and both may run at once.

Leave that terminal open — closing it stops the display.

## Putting it on the projector

1. **Connect the projector and set displays to Extend, not Mirror.** Mirroring
   gives you the same image at your monitor's aspect ratio, usually letterboxed.
   - Windows: <kbd>Win</kbd>+<kbd>P</kbd> → *Extend*
   - macOS: System Settings → Displays → arrange, uncheck *Mirror*
2. **Open `http://localhost:3001` and drag the window onto the projected
   screen.**
3. **Press <kbd>F11</kbd>** (macOS: <kbd>Ctrl</kbd>+<kbd>Cmd</kbd>+<kbd>F</kbd>)
   for fullscreen. The cursor is already hidden by CSS.

### One command instead

With the server already running in another terminal:

```bash
npm run projector
```

That opens the dashboard fullscreen on the projector — no tabs, no address bar,
no dragging — and leaves your monitor free. Quit with <kbd>Alt</kbd>+<kbd>F4</kbd>
(macOS: <kbd>Cmd</kbd>+<kbd>Q</kbd>).

**If it opens on the wrong screen,** one number needs changing. Chrome places
windows by absolute desktop coordinates, and an extended display starts where
the primary one ends — so the offset is your primary monitor's width:

```bash
PROJECTOR_X=2560 npm run projector    # 1440p primary
PROJECTOR_X=-1920 npm run projector   # projector arranged on the LEFT
```

The script refuses to launch if nothing is serving the port, rather than
opening a blank window on the wall. Set `BROWSER_PATH` if Chrome, Chromium or
Edge is somewhere unusual.

Two details in it that are not obvious:

- **It uses its own Chrome profile** (`.projector-profile/`, gitignored). If
  Chrome is already running, launching it again just hands the URL to the
  existing process and *silently ignores every flag* — no kiosk, no window
  position, no error. A separate profile forces a new instance that honours
  them. Being persistent, it also means you grant the microphone permission
  once rather than every launch.
- **Background throttling is disabled.** Chrome slows timers and rendering in
  unfocused windows, which for a wall display is the normal state — the clock
  would stop ticking and the refresh would stall the moment you clicked back to
  your editor.

### Talking to it from your desk

Just say **"Jarvis"** — the default mode listens through the microphone, so it
works with the projected window in the background while you work on your main
monitor.

Push-to-talk is the exception: the space bar is a `keydown` listener on the
page, and a browser page cannot see keystrokes while another app is focused. In
that mode you have to click the projected window first.

### Practical notes

- **Microphone position matters more than the projector.** The mic should be
  near you, not near the wall. A laptop mic across the room transcribes badly
  and Whisper will confidently invent words to fill gaps.
- **Permissions:** the browser prompts for the microphone on first use. Allow
  it once. `getUserMedia` needs a secure context, and `localhost` counts as one
   — no HTTPS certificate needed.
- **Stop the screen sleeping.** A projected display will blank on your normal
  idle timeout. Set the power profile to never sleep while plugged in, or the
  wall goes dark mid-session.
- **Projector brightness:** the design assumes a dimmed room. In daylight, a
  dark background on a projector reads as grey. Change `base` in
  `tailwind.config.ts` if you need a lighter theme for a bright room.
- The page reloads itself every 60 seconds, so editing a file in `memory/`
  updates the wall without touching a keyboard.

## Voice

**Say "Jarvis".** Either in one breath — *"Jarvis, what are my open questions"*
— or on its own, which gets a "Yes?" and then listens for eight seconds.

Two modes, switchable from the link in the voice bar and remembered between
sessions:

| Mode | Trigger | Needs window focus? |
|---|---|---|
| **Wake word** (default) | say "Jarvis" | no |
| **Push to talk** | hold <kbd>space</kbd> | yes |

Push-to-talk only works while the dashboard window has keyboard focus, because
a web page cannot see keystrokes belonging to another application. That is the
reason the wake word exists — it makes focus irrelevant, so you can talk to the
wall while working on your monitor.

### What the microphone actually does

The mic is genuinely always open in wake-word mode. Precisely what that means:

1. Audio lives only in a **memory ring buffer** a few hundred milliseconds
   long, overwritten continuously. Nothing is written to disk.
2. **Voice activity detection** cuts out only the stretches where someone is
   speaking. Silence never goes any further.
3. Each speech segment is transcribed **on this machine** by the local Whisper
   route. No audio is uploaded.
4. If the text does not start with "Jarvis", the text and the audio are
   **discarded** — not displayed, not stored, not logged.

What that does not do is upload audio, keep a history, or write anything down.
What it does do is transcribe everything said near the mic, locally, which
costs CPU. That is a real cost and a different bargain from a cloud assistant,
but it is not "off". Switch to push-to-talk if you want the mic genuinely
closed.

Wake word is unavailable when the Web Speech engine is selected, and
deliberately so: always-on listening through a cloud recogniser would stream
your room to Google.

### Detection details

The wake word is matched against a list of spellings Whisper actually produces
for the name — "Jervis", "Javis", "Jarviss" — within an edit distance of 1. A
looser distance of 2 accepted "carbis", which a test caught. Matching is
anchored to the first token or two, so *"I was telling Dave about Jarvis"* does
not fire; an assistant that joins conversations about itself is the false
positive people find genuinely unnerving.

Replies are ignored by the detector while the assistant is speaking, plus a
400 ms tail. Without that, echo cancellation is not reliable enough to stop it
hearing its own voice through the speakers and waking itself up.

`npm test` covers the matcher — both directions, since too strict feels broken
and too loose interrupts conversations.

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
