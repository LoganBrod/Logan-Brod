"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Transcriber, TranscriberState } from "@/lib/speech/types";
import { createWhisperTranscriber } from "@/lib/speech/whisperLocal";
import { createWebSpeechTranscriber } from "@/lib/speech/webSpeech";
import { createMockTranscriber } from "@/lib/speech/mock";
import { startVad, type VadHandle } from "@/lib/speech/vad";
import { createWakeWordListener } from "@/lib/speech/wakeWord";
import { speak, stopSpeaking } from "@/lib/speech/speak";
import { respond, type Snapshot } from "@/lib/respond";

type UiState = TranscriberState | "speaking" | "armed";
type Mode = "wake" | "push";

const MODE_KEY = "jarvis:mode";

const LABEL: Record<UiState, string> = {
  idle: "Hold space to talk",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
  armed: "Yes?",
};

export default function VoicePanel({ snapshot }: { snapshot: Snapshot }) {
  const [state, setState] = useState<UiState>("idle");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [engineLabel, setEngineLabel] = useState("");
  const [isMock, setIsMock] = useState(false);
  const [mode, setMode] = useState<Mode>("wake");
  const [micLive, setMicLive] = useState(false);
  const [level, setLevel] = useState(0);

  const transcriberRef = useRef<Transcriber | null>(null);
  const activeRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // Read by the audio callback, which must see the current value without the
  // VAD being torn down and restarted on every state change.
  const speakingRef = useRef(false);

  const answer = useCallback((text: string) => {
    setPartial("");
    setHeard(text);
    const result = respond(text, snapshotRef.current);
    setReply(result.text);
    setState("speaking");
    speakingRef.current = true;

    speak(result.text, {
      onEnd: () => {
        // Held briefly past the end of speech: speaker audio reaches the mic
        // slightly late, and resuming instantly lets the tail of the sentence
        // trigger the next segment.
        setTimeout(() => {
          speakingRef.current = false;
        }, 400);
        setState("idle");
      },
    });
  }, []);

  // Engine and saved mode both depend on the browser, so they are resolved
  // after mount — reading them during render would make the server and client
  // disagree and break hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const choice = params.get("speech");
    const candidates: Transcriber[] =
      choice === "mock"
        ? [createMockTranscriber()]
        : choice === "web"
          ? [createWebSpeechTranscriber()]
          : [createWhisperTranscriber(), createWebSpeechTranscriber()];

    const selected = candidates.find((t) => t.isSupported()) ?? null;
    transcriberRef.current = selected;
    setEngineLabel(selected ? selected.label : "No microphone support");

    const mock = selected?.id === "mock";
    setIsMock(mock);

    const saved = window.localStorage.getItem(MODE_KEY) as Mode | null;
    // Wake word needs local Whisper; it cannot run on the cloud engine without
    // streaming everything said in the room to a third party.
    const canWake = !mock && selected?.id === "whisper-local";
    setMode(canWake ? (saved ?? "wake") : "push");
  }, []);

  /* ------------------------------ wake word ----------------------------- */

  useEffect(() => {
    if (mode !== "wake" || isMock) return;

    let handle: VadHandle | null = null;
    let cancelled = false;

    const listener = createWakeWordListener({
      onCommand: (command) => {
        if (command) answer(command);
      },
      onArmed: () => {
        setState("armed");
        setHeard("");
        setReply("");
        // Short chirp of acknowledgement so a bare "Jarvis" is not silence.
        speak("Yes?", { rate: 1.15 });
        speakingRef.current = true;
        setTimeout(() => {
          speakingRef.current = false;
        }, 700);
      },
      onError: (err) => setError(err.message),
    });

    void startVad({
      onSegment: (audio) => {
        // Ignore the assistant's own voice. Echo cancellation helps but does
        // not reliably remove speaker output, and without this the reply
        // wakes it up again — an assistant talking to itself.
        if (speakingRef.current) return;
        listener.handleSegment(audio);
      },
      onLevel: (rms, speech) => {
        setLevel(rms);
        if (!speakingRef.current) {
          setState((current) =>
            current === "armed"
              ? "armed"
              : speech
                ? "listening"
                : current === "listening"
                  ? "idle"
                  : current,
          );
        }
      },
      onError: (err) => setError(err.message),
    })
      .then((h) => {
        if (cancelled) h.stop();
        else {
          handle = h;
          setMicLive(true);
        }
      })
      .catch((err: unknown) => {
        setMicLive(false);
        setError(
          err instanceof Error
            ? `Microphone unavailable: ${err.message}`
            : "Microphone unavailable",
        );
      });

    return () => {
      cancelled = true;
      handle?.stop();
      setMicLive(false);
    };
  }, [mode, isMock, answer]);

  /* --------------------------- push to talk ----------------------------- */

  const begin = useCallback(async () => {
    const transcriber = transcriberRef.current;
    if (!transcriber || activeRef.current) return;

    activeRef.current = true;
    setError("");
    setReply("");
    setHeard("");
    stopSpeaking();

    await transcriber.start({
      onPartial: setPartial,
      onFinal: answer,
      onStateChange: (s) => setState(s),
      onError: (e) => {
        setError(e.message);
        setState("idle");
        activeRef.current = false;
      },
    });
  }, [answer]);

  const end = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setPartial("");
    await transcriberRef.current?.stop();
  }, []);

  useEffect(() => {
    if (isMock) void begin();
  }, [isMock, begin]);

  useEffect(() => {
    if (isMock || mode === "wake") return;

    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      void begin();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      void end();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [begin, end, isMock, mode]);

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next: Mode = current === "wake" ? "push" : "wake";
      window.localStorage.setItem(MODE_KEY, next);
      stopSpeaking();
      setState("idle");
      return next;
    });
  }, []);

  const idleLabel = isMock
    ? "Type, then Enter"
    : mode === "wake"
      ? micLive
        ? 'Say "Jarvis"'
        : "Microphone off"
      : LABEL.idle;

  const active = state !== "idle" || !!heard || !!error;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 transition-all duration-500 ${
        active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-70"
      }`}
    >
      <div className="bg-gradient-to-t from-base via-base/95 to-transparent px-8 pb-7 pt-16">
        <div className="flex items-start gap-5">
          <Indicator state={state} level={level} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <span className="text-sm uppercase tracking-[0.25em] text-accent/70">
                {state === "idle" ? idleLabel : LABEL[state]}
              </span>
              <span className="text-xs uppercase tracking-widest text-white/25">
                {engineLabel}
              </span>
              {!isMock && (
                <button
                  onClick={toggleMode}
                  className="pointer-events-auto text-xs uppercase tracking-widest text-white/25 underline decoration-dotted underline-offset-4 transition hover:text-white/60"
                >
                  {mode === "wake" ? "wake word" : "push to talk"}
                </button>
              )}
            </div>

            {(partial || heard) && (
              <p className="mt-1.5 truncate text-2xl text-white/85">
                {partial || heard}
              </p>
            )}

            {reply && (
              <p className="mt-1 text-xl leading-snug text-accent/85">{reply}</p>
            )}

            {error && <p className="mt-1 text-lg text-warn/90">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicator({ state, level }: { state: UiState; level: number }) {
  const ring =
    state === "listening" || state === "armed"
      ? "border-accent"
      : state === "processing"
        ? "border-warn/80"
        : state === "speaking"
          ? "border-accent/70"
          : "border-edge";

  // The dot tracks live input level, so it is visibly obvious when the
  // microphone is hearing something. An always-on mic should never be a
  // silent state.
  const scale = Math.min(1, 0.25 + level * 14);

  return (
    <div
      className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${ring}`}
    >
      <span
        className={`rounded-full bg-accent transition-all duration-150 ${
          state === "processing"
            ? "h-3 w-3 animate-ping"
            : state === "speaking"
              ? "h-4 w-4 breathe"
              : ""
        }`}
        style={
          state === "processing" || state === "speaking"
            ? undefined
            : {
                width: `${Math.round(scale * 22)}px`,
                height: `${Math.round(scale * 22)}px`,
                opacity: state === "armed" ? 1 : 0.45 + scale * 0.55,
              }
        }
      />
    </div>
  );
}
