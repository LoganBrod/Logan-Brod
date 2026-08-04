/**
 * Wake word detection: "Jarvis".
 *
 * How it works, and what it means for what the microphone hears:
 *
 *   1. The mic is open continuously, but audio only lives in a memory ring
 *      buffer — a few hundred milliseconds at a time, overwritten constantly.
 *   2. Voice activity detection cuts out the stretches where someone is
 *      actually speaking. Silence never gets past this point.
 *   3. Each speech segment is transcribed *on this machine* by the local
 *      Whisper route. No audio is uploaded anywhere.
 *   4. If the text does not start with the wake word, both the text and the
 *      audio are dropped and nothing is displayed or stored.
 *
 * So this is genuinely always-listening, and it is worth being precise about
 * what that costs: everything said near the microphone gets transcribed
 * locally, which uses CPU, and a transcript of it exists in memory for a
 * fraction of a second before being discarded. What it does *not* do is upload
 * audio, write anything to disk, or keep a history. That is a meaningfully
 * different bargain from a cloud assistant, but it is not "off".
 */

/**
 * Spellings that count as the wake word.
 *
 * Listed explicitly rather than caught by a loose edit distance. Allowing a
 * distance of 2 on a six-letter word accepts anything with a third of its
 * letters wrong — "carbis" matched "jarvis" that way, which a test caught.
 * Each entry here is a rendering Whisper genuinely produces for a name it has
 * no context for, and each is matched within a distance of 1.
 */
const WAKE_WORDS = [
  "jarvis",
  "jarviss",
  "jervis",
  "javis",
  "jarvus",
  "javas",
  "gervis",
];
const PREFIXES = ["hey", "ok", "okay", "hi", "yo"];

/** Seconds after a bare "Jarvis" during which the next utterance is a command. */
const ARMED_WINDOW_MS = 8_000;

export interface WakeWordEvents {
  /** Wake word heard, with whatever followed it (may be empty). */
  onCommand: (command: string) => void;
  /** Wake word heard with nothing after it — waiting for a follow-up. */
  onArmed?: () => void;
  onListening?: (speaking: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Levenshtein distance, capped for early exit.
 *
 * Needed because Whisper transcribes a name it has no context for
 * inconsistently — "Jarvis" comes back as "Jervis", "Javis", "Jarvis," and
 * occasionally "Java's". Exact matching would make the wake word feel broken
 * perhaps a third of the time, which is worse than the occasional false accept
 * that fuzzy matching allows.
 */
function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      row[j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1; // whole row already too far
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

function isWakeToken(token: string): boolean {
  const clean = token.replace(/[^a-z]/g, "");
  if (clean.length < 5) return false; // too short to be any spelling of it
  return WAKE_WORDS.some((w) => distance(clean, w, 1) <= 1);
}

export interface WakeMatch {
  matched: boolean;
  /** What was said after the wake word. Empty when only the name was spoken. */
  command: string;
}

/**
 * Look for the wake word at the start of an utterance.
 *
 * Anchored to the first two tokens on purpose. Scanning the whole sentence
 * would fire on "I was telling Dave about Jarvis", which is exactly the
 * false-positive people find unnerving.
 */
export function matchWakeWord(transcript: string): WakeMatch {
  const tokens = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return { matched: false, command: "" };

  let index = -1;
  if (isWakeToken(tokens[0] ?? "")) index = 0;
  else if (
    tokens.length > 1 &&
    PREFIXES.includes(tokens[0] ?? "") &&
    isWakeToken(tokens[1] ?? "")
  )
    index = 1;

  if (index === -1) return { matched: false, command: "" };
  return { matched: true, command: tokens.slice(index + 1).join(" ").trim() };
}

async function transcribe(audio: Float32Array): Promise<string> {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: audio.buffer as ArrayBuffer,
  });

  const payload = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Transcription failed");
  return payload.text ?? "";
}

export interface WakeWordListener {
  /** Feed a speech segment from the VAD. */
  handleSegment(audio: Float32Array): void;
  /** True while waiting for a follow-up after a bare "Jarvis". */
  isArmed(): boolean;
  reset(): void;
}

export function createWakeWordListener(
  events: WakeWordEvents,
): WakeWordListener {
  let busy = false;
  let armedUntil = 0;

  return {
    isArmed: () => Date.now() < armedUntil,

    reset() {
      armedUntil = 0;
    },

    handleSegment(audio: Float32Array) {
      // One transcription at a time. Speech segments can arrive faster than
      // the model finishes, and queueing them would build a backlog that
      // answers questions from a minute ago.
      if (busy) return;
      busy = true;

      void transcribe(audio)
        .then((text) => {
          const clean = text.trim();
          if (!clean) return;

          const armed = Date.now() < armedUntil;
          const { matched, command } = matchWakeWord(clean);

          if (armed && !matched) {
            // Already woken and waiting — take this as the command.
            armedUntil = 0;
            events.onCommand(clean);
            return;
          }

          if (!matched) return; // discarded: not addressed to us

          if (command) {
            armedUntil = 0;
            events.onCommand(command);
          } else {
            // Bare "Jarvis" — acknowledge and wait for the actual question.
            armedUntil = Date.now() + ARMED_WINDOW_MS;
            events.onArmed?.();
          }
        })
        .catch((err) =>
          events.onError?.(
            err instanceof Error ? err : new Error("Transcription failed"),
          ),
        )
        .finally(() => {
          busy = false;
        });
    },
  };
}
