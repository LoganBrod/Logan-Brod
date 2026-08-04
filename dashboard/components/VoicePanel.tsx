"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Transcriber, TranscriberState } from "@/lib/speech/types";
import { createWhisperTranscriber } from "@/lib/speech/whisperLocal";
import { createWebSpeechTranscriber } from "@/lib/speech/webSpeech";
import { createMockTranscriber } from "@/lib/speech/mock";
import { speak, stopSpeaking } from "@/lib/speech/speak";
import { respond, type Snapshot } from "@/lib/respond";

type UiState = TranscriberState | "speaking";

const LABEL: Record<UiState, string> = {
  idle: "Hold space to talk",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
};

// Test mode is always open and never binds space, so the idle prompt would be
// a lie there.
const MOCK_IDLE_LABEL = "Type, then Enter";

export default function VoicePanel({ snapshot }: { snapshot: Snapshot }) {
  const [state, setState] = useState<UiState>("idle");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [engineLabel, setEngineLabel] = useState("");

  // Refs, not state: the keyboard handlers below must see current values
  // without being torn down and rebuilt on every keystroke.
  const transcriberRef = useRef<Transcriber | null>(null);
  const activeRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // Engine choice depends on window.location and on browser feature checks, so
  // it is resolved *after* mount and held in state.
  //
  // Doing it during render caused a hydration mismatch: the server has no
  // window, so it rendered the push-to-talk prompt while the client rendered
  // the test-mode one for the same node, and React tore the tree down. Any
  // value that differs between server and first client render has to arrive
  // through an effect.
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    const choice = new URLSearchParams(window.location.search).get("speech");
    const candidates: Transcriber[] =
      choice === "mock"
        ? [createMockTranscriber()]
        : choice === "web"
          ? [createWebSpeechTranscriber()]
          : [createWhisperTranscriber(), createWebSpeechTranscriber()];

    const selected = candidates.find((t) => t.isSupported()) ?? null;
    transcriberRef.current = selected;
    setEngineLabel(selected ? selected.label : "No microphone support");
    setIsMock(selected?.id === "mock");
  }, []);

  const handleFinal = useCallback((text: string) => {
    setPartial("");
    setHeard(text);
    const answer = respond(text, snapshotRef.current);
    setReply(answer.text);
    setState("speaking");
    speak(answer.text, { onEnd: () => setState("idle") });
  }, []);

  const begin = useCallback(async () => {
    const t = transcriberRef.current;
    if (!t || activeRef.current) return;

    activeRef.current = true;
    setError("");
    setReply("");
    setHeard("");
    stopSpeaking(); // barge-in: talking over the assistant cuts it off

    await t.start({
      onPartial: setPartial,
      onFinal: handleFinal,
      onStateChange: (s) => setState(s),
      onError: (e) => {
        setError(e.message);
        setState("idle");
        activeRef.current = false;
      },
    });
  }, [handleFinal]);

  const end = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setPartial("");
    await transcriberRef.current?.stop();
  }, []);

  // Test mode types instead of talking, so it stays open continuously — and
  // must not bind the space bar, since sentences contain spaces.
  useEffect(() => {
    if (isMock) void begin();
  }, [isMock, begin]);

  // Push-to-talk on the space bar.
  //
  // Chosen over always-on listening deliberately: a wall-mounted microphone
  // that records continuously is a different thing to have in your room than
  // one that records while you hold a key. It also removes wake-word
  // detection, false triggers from the TV, and the need to stream audio
  // anywhere at all.
  useEffect(() => {
    if (isMock) return;

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
  }, [begin, end, isMock]);

  const active = state !== "idle" || !!heard || !!error;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 transition-all duration-500 ${
        active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-70"
      }`}
    >
      <div className="bg-gradient-to-t from-base via-base/95 to-transparent px-8 pb-7 pt-16">
        <div className="flex items-start gap-5">
          <Indicator state={state} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <span className="text-sm uppercase tracking-[0.25em] text-accent/70">
                {isMock && state !== "speaking" ? MOCK_IDLE_LABEL : LABEL[state]}
              </span>
              <span className="text-xs uppercase tracking-widest text-white/25">
                {engineLabel}
              </span>
            </div>

            {(partial || heard) && (
              <p className="mt-1.5 truncate text-2xl text-white/85">
                {partial || heard}
              </p>
            )}

            {reply && (
              <p className="mt-1 text-xl leading-snug text-accent/85">{reply}</p>
            )}

            {error && (
              <p className="mt-1 text-lg text-warn/90">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicator({ state }: { state: UiState }) {
  const ring =
    state === "listening"
      ? "border-accent scale-110"
      : state === "processing"
        ? "border-warn/80"
        : state === "speaking"
          ? "border-accent/70"
          : "border-edge";

  return (
    <div
      className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${ring}`}
    >
      <span
        className={`rounded-full bg-accent transition-all duration-300 ${
          state === "listening"
            ? "h-5 w-5 animate-pulse"
            : state === "processing"
              ? "h-3 w-3 animate-ping"
              : state === "speaking"
                ? "h-4 w-4 breathe"
                : "h-2.5 w-2.5 opacity-40"
        }`}
      />
    </div>
  );
}
