import type { Word } from "./transcribe";

interface Chunk {
  text: string;
  start: number;
  end: number;
}

/**
 * Group word timestamps into short punchy caption chunks (max 3 words /
 * ~1.4s), the style that performs on vertical clips.
 */
function chunkWords(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      text: current.map((w) => w.word).join(" ").toUpperCase(),
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (const word of words) {
    if (!word.word) continue;
    if (
      current.length >= 3 ||
      (current.length > 0 && word.end - current[0].start > 1.4) ||
      (current.length > 0 && word.start - current[current.length - 1].end > 0.6)
    ) {
      flush();
    }
    current.push(word);
  }
  flush();

  // Keep each caption on screen until the next one starts (min 0.2s hold)
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1];
    chunks[i].end = next ? Math.max(chunks[i].end, next.start) : chunks[i].end + 0.4;
  }
  return chunks;
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${h}:${pad(m)}:${pad(sec)}.${pad(cs)}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "");
}

/** Build an ASS subtitle document: big bold centered captions, lower third. */
export function buildAss(words: Word[]): string {
  const chunks = chunkWords(words);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hype,Arial,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,7,2,2,60,60,420,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = chunks
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Hype,,0,0,0,,${escapeAss(c.text)}`
    )
    .join("\n");
  return header + events + "\n";
}
