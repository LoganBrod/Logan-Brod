import fs from "fs/promises";

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: Word[];
}

/**
 * Transcribe clip audio with OpenAI Whisper (word-level timestamps for
 * karaoke-style captions). Returns null when OPENAI_API_KEY isn't set so the
 * pipeline can skip captions gracefully.
 */
export async function transcribe(audioPath: string): Promise<Transcript | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const audio = await fs.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "clip.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper transcription failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    text: string;
    words?: { word: string; start: number; end: number }[];
  };
  return {
    text: data.text ?? "",
    words: (data.words ?? []).map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
  };
}
