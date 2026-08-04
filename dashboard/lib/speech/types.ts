/**
 * The boundary between "capturing speech" and "which engine does it".
 *
 * Two engines with genuinely different shapes have to fit through here:
 *
 *   Web Speech  — streaming. Results arrive while you talk, and stop() just
 *                 ends the stream.
 *   Whisper     — batch. Audio is buffered while you talk and only transcribed
 *                 when you stop, so stop() is where the work happens.
 *
 * The interface accommodates both by making partial results optional and
 * allowing final text to arrive after stop() resolves. Anything that assumed
 * results-as-you-speak would have locked out on-device transcription.
 */

export type TranscriberState = "idle" | "listening" | "processing";

export interface TranscriberHandlers {
  /** Live, unstable text. Streaming engines only — never rely on it. */
  onPartial?: (text: string) => void;
  /** A settled utterance. The only output worth acting on. */
  onFinal: (text: string) => void;
  onStateChange?: (state: TranscriberState) => void;
  onError: (error: Error) => void;
}

export interface Transcriber {
  readonly id: string;
  readonly label: string;
  /**
   * Where the audio goes. Surfaced in the UI on purpose — "who hears this"
   * should be visible on screen, not buried in a config file.
   */
  readonly privacy: "on-device" | "cloud";
  /** Whether this engine can run in the current browser. */
  isSupported(): boolean;
  start(handlers: TranscriberHandlers): Promise<void>;
  stop(): Promise<void>;
}
