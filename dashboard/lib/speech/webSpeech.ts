/**
 * Web Speech API transcriber — the browser's built-in recogniser.
 *
 * Instant to set up, nothing to download, and works today. The cost, stated
 * plainly because it is the reason this is not the default: in Chrome the
 * audio is streamed to Google's servers for recognition. It is not on-device,
 * regardless of running "in the browser".
 *
 * Kept as a fallback for machines that cannot run the local model.
 */

import type { Transcriber, TranscriberHandlers } from "./types";

// SpeechRecognition is not in TypeScript's DOM lib — it is still a draft spec
// and remains vendor-prefixed in Chrome. These are the parts actually used.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createWebSpeechTranscriber(): Transcriber {
  let recognition: SpeechRecognitionLike | null = null;
  let stopping = false;

  return {
    id: "web-speech",
    label: "Browser (Google)",
    privacy: "cloud",

    isSupported: () => getConstructor() !== null,

    async start(handlers: TranscriberHandlers) {
      const Ctor = getConstructor();
      if (!Ctor) {
        handlers.onError(
          new Error("This browser has no Web Speech API. Chrome supports it."),
        );
        return;
      }

      stopping = false;
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        // Only results from resultIndex onward are new; earlier ones have
        // already been delivered and would be emitted twice otherwise.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) handlers.onFinal(text);
          else handlers.onPartial?.(text);
        }
      };

      recognition.onerror = (event) => {
        // "aborted" and "no-speech" are ordinary lifecycle noise, not faults.
        if (event.error === "aborted" || event.error === "no-speech") return;
        handlers.onError(new Error(`Speech recognition error: ${event.error}`));
      };

      recognition.onend = () => {
        if (!stopping) handlers.onStateChange?.("idle");
      };

      recognition.start();
      handlers.onStateChange?.("listening");
    },

    async stop() {
      stopping = true;
      recognition?.stop();
      recognition = null;
    },
  };
}
