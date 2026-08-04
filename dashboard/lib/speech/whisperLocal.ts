/**
 * Whisper transcriber. Records in the browser, transcribes on localhost.
 *
 * Batch, not streaming: audio is buffered while you speak and transcribed on
 * stop(). That is inherent to Whisper — it uses the end of an utterance to
 * disambiguate the beginning, which is a large part of why it beats streaming
 * recognisers on accuracy. The UI shows a "thinking" state to cover it.
 *
 * The browser does capture, decoding and resampling; the server does inference.
 * That split exists because each side already has the better tool: the Web
 * Audio API is an excellent audio decoder that Node lacks without ffmpeg, and
 * Node has the native ONNX runtime that browsers only have as WASM.
 */

import type { Transcriber, TranscriberHandlers } from "./types";

const SAMPLE_RATE = 16_000; // what Whisper expects

/** Decode recorded audio to the mono 16 kHz Float32 samples the model wants. */
async function toWhisperAudio(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();

  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(bytes);
  } finally {
    void decodeCtx.close();
  }

  // OfflineAudioContext resamples as it renders — simpler and better quality
  // than dropping samples by hand, and it downmixes to mono on the way.
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export function createWhisperTranscriber(): Transcriber {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let handlers: TranscriberHandlers | null = null;

  function releaseMic() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  return {
    id: "whisper-local",
    label: "Whisper (local)",
    privacy: "on-device",

    isSupported: () =>
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,

    async start(h: TranscriberHandlers) {
      handlers = h;
      chunks = [];

      try {
        // Warm the model and prompt for the mic at the same time — no reason
        // to serialise a download behind a permission dialog.
        void fetch("/api/transcribe").catch(() => {});

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.start();
        h.onStateChange?.("listening");
      } catch (error) {
        releaseMic();
        h.onStateChange?.("idle");
        h.onError(
          error instanceof Error
            ? new Error(`Microphone unavailable: ${error.message}`)
            : new Error("Microphone unavailable"),
        );
      }
    },

    async stop() {
      const h = handlers;
      const active = recorder;
      if (!active || !h) return;

      const finished = new Promise<Blob>((resolve) => {
        active.onstop = () =>
          resolve(new Blob(chunks, { type: active.mimeType || "audio/webm" }));
      });

      active.stop();
      releaseMic();
      recorder = null;
      h.onStateChange?.("processing");

      try {
        const blob = await finished;
        if (blob.size === 0) return;

        const audio = await toWhisperAudio(blob);
        if (audio.length < SAMPLE_RATE * 0.2) return; // stray click, not speech

        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: audio.buffer as ArrayBuffer,
        });

        const payload = (await response.json()) as {
          text?: string;
          error?: string;
        };

        if (!response.ok) throw new Error(payload.error ?? "Transcription failed");
        if (payload.text) h.onFinal(payload.text);
      } catch (error) {
        h.onError(
          error instanceof Error ? error : new Error("Transcription failed"),
        );
      } finally {
        h.onStateChange?.("idle");
      }
    },
  };
}
