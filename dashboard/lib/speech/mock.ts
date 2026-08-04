/**
 * A transcriber you type into.
 *
 * Exists so the voice loop is testable without a microphone — in CI, over a
 * remote session, or when checking the UI's states without saying the same
 * sentence forty times. It is also how the states in VoicePanel were verified,
 * since neither real engine can run in a headless container.
 *
 * Selected with ?speech=mock in the URL. Not reachable by accident.
 */

import type { Transcriber, TranscriberHandlers } from "./types";

export function createMockTranscriber(): Transcriber {
  let handlers: TranscriberHandlers | null = null;
  let listener: ((e: KeyboardEvent) => void) | null = null;
  let buffer = "";

  return {
    id: "mock",
    label: "Typed (test mode)",
    privacy: "on-device",
    isSupported: () => typeof window !== "undefined",

    async start(h: TranscriberHandlers) {
      handlers = h;
      buffer = "";

      listener = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          const text = buffer.trim();
          buffer = "";
          if (text) handlers?.onFinal(text);
        } else if (e.key === "Backspace") {
          buffer = buffer.slice(0, -1);
          handlers?.onPartial?.(buffer);
        } else if (e.key.length === 1) {
          buffer += e.key;
          handlers?.onPartial?.(buffer);
        }
      };

      window.addEventListener("keydown", listener);
      h.onStateChange?.("listening");
    },

    async stop() {
      if (listener) window.removeEventListener("keydown", listener);
      listener = null;
      handlers?.onStateChange?.("idle");
    },
  };
}
