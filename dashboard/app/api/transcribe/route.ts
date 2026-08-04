/**
 * Whisper transcription, running in this app's own Node process.
 *
 * "Server-side" here means *your machine*. The dashboard is local-only, so
 * audio goes from the browser to localhost and no further. That is the same
 * privacy story as running the model in the browser tab, without the browser's
 * WASM bundling problems, and it is faster: Node uses the native ONNX runtime
 * rather than a WebAssembly build of it.
 *
 * The client sends raw mono 16 kHz Float32 samples, already decoded and
 * resampled by the Web Audio API. Doing that in the browser avoids needing an
 * audio decoder (or ffmpeg) on the Node side — the browser already has an
 * excellent one and this route stays a thin wrapper around the model.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = process.env.WHISPER_MODEL ?? "onnx-community/whisper-base.en";
const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 120;

type Asr = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

// Loaded once per process and reused. The first call downloads the model
// (~80 MB) into the transformers.js cache; every call after that is local.
let asrPromise: Promise<Asr> | null = null;

async function getAsr(): Promise<Asr> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const asr = await pipeline("automatic-speech-recognition", MODEL);
      return asr as unknown as Asr;
    })();

    // A failed download must not poison every later request.
    asrPromise.catch(() => {
      asrPromise = null;
    });
  }
  return asrPromise;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const buffer = await request.arrayBuffer();

    // Float32Array needs its byte length to be a multiple of 4, and a
    // misaligned body would otherwise throw deep inside the model.
    if (buffer.byteLength === 0 || buffer.byteLength % 4 !== 0) {
      return NextResponse.json(
        { error: "Expected raw Float32 PCM samples." },
        { status: 400 },
      );
    }

    const audio = new Float32Array(buffer);

    // Under ~0.2s is a stray click, not speech. Whisper will confidently
    // hallucinate a sentence from near-silence, so short clips are dropped
    // rather than transcribed.
    if (audio.length < SAMPLE_RATE * 0.2) {
      return NextResponse.json({ text: "" });
    }

    if (audio.length > SAMPLE_RATE * MAX_SECONDS) {
      return NextResponse.json(
        { error: `Audio longer than ${MAX_SECONDS}s.` },
        { status: 413 },
      );
    }

    const asr = await getAsr();
    const result = await asr(audio);
    const text = Array.isArray(result) ? (result[0]?.text ?? "") : result.text;

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("[transcribe] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Transcription failed.",
      },
      { status: 500 },
    );
  }
}

/** Lets the client warm the model up before the first utterance. */
export async function GET(): Promise<NextResponse> {
  try {
    await getAsr();
    return NextResponse.json({ ready: true, model: MODEL });
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        model: MODEL,
        error: error instanceof Error ? error.message : "Model failed to load.",
      },
      { status: 503 },
    );
  }
}
