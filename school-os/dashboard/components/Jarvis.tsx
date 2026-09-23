"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Waveform } from "@phosphor-icons/react";
import { Markdown } from "./Markdown";
import { speak, stopSpeaking, warmVoices } from "@/lib/speak";

const ACKS = ["On it.", "One moment.", "Let me look.", "Checking."];
const SILENCE_MS = 1300;   // how long you have to stop talking before it sends
const FOLLOW_UP_MS = 8000; // how long it keeps listening after a reply, no wake word needed

/**
 * Always-on voice. Listens for the wake word, waits for you to finish, sends the whole
 * utterance to the assistant, pauses the microphone while it speaks so it never hears
 * itself, and stays awake briefly afterwards for a follow-up.
 */
export function Jarvis({ wakeWord, name, voice, greeting }: { wakeWord: string; name: string; voice?: string; greeting?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "awake" | "thinking" | "speaking" | "reply">("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<{ text: string; steps: string[] } | null>(null);

  const rec = useRef<SpeechRecognitionLike | null>(null);
  const onRef = useRef(false);
  const paused = useRef(false);           // true while speaking: recognition is stopped on purpose
  const awake = useRef(false);
  const segments = useRef<string[]>([]);  // final phrases since the wake word
  const seen = useRef(0);                 // how many results of the current session are already in segments
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const wake = wakeWord.toLowerCase();

  useEffect(() => {
    setSupported(Boolean(getSR()));
    warmVoices();
    try { setOn(localStorage.getItem("jarvis") === "on"); } catch {}
  }, []);

  useEffect(() => {
    onRef.current = on;
    try { localStorage.setItem("jarvis", on ? "on" : "off"); } catch {}
    if (!on) { stopRec(); setState("idle"); return; }
    startRec();
    // First visit of the day with voice on: say hello once.
    const key = `jarvis-greeted-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (greeting && !localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        void say(greeting, greeting, []);
      }
    } catch {}
    return () => stopRec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  function getSR(): SRCtor | undefined {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  function startRec() {
    const SR = getSR();
    if (!SR || rec.current) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    r.onstart = () => { seen.current = 0; };
    r.onresult = (e) => {
      if (paused.current) return;
      // Fold newly-final results into segments; keep the live interim text separately.
      let interim = "";
      for (let i = seen.current; i < e.results.length; i++) {
        const t = Array.from(e.results[i]).map((x) => x.transcript).join("").trim();
        if (e.results[i].isFinal) { segments.current.push(t); seen.current = i + 1; }
        else interim = t;
      }
      const all = `${segments.current.join(" ")} ${interim}`.trim();
      const lower = all.toLowerCase();

      if (!awake.current) {
        const i = lower.lastIndexOf(wake);
        if (i < 0) { if (segments.current.length > 12) segments.current = []; return; } // keep the buffer small while idle
        awake.current = true; setState("awake"); setReply(null); stopSpeaking();
        // Drop everything up to and including the wake word.
        const after = all.slice(i + wake.length).replace(/^[,.!?\s]+/, "");
        segments.current = after ? [after] : [];
        if (interim && after.endsWith(interim)) segments.current = [after.slice(0, -interim.length).trim()].filter(Boolean);
        setHeard(after);
        armSilence();
        return;
      }
      setHeard(all);
      armSilence();
    };
    r.onend = () => { rec.current = null; if (onRef.current && !paused.current) setTimeout(startRec, 150); };
    r.onerror = () => {};
    try { r.start(); rec.current = r; } catch {}
  }
  function stopRec() { const r = rec.current; rec.current = null; if (r) { r.onend = () => {}; try { r.stop(); } catch {} } }

  /** Send once you have been quiet for a moment, so a mid-sentence pause does not cut you off. */
  function armSilence() {
    if (silence.current) clearTimeout(silence.current);
    silence.current = setTimeout(() => {
      const text = segments.current.join(" ").trim();
      segments.current = [];
      if (text.split(/\s+/).filter(Boolean).length >= 2) void ask(text);
      else if (awake.current) armSilence(); // heard the wake word but nothing after it yet: keep waiting
    }, SILENCE_MS);
  }

  /** Speak with the microphone off, then listen again. */
  async function say(spoken: string, shown: string, steps: string[]) {
    paused.current = true; stopRec();
    setReply({ text: shown, steps }); setState("speaking");
    await speak(spoken, voice);
    paused.current = false;
    if (onRef.current) startRec();
  }

  async function ask(q: string) {
    awake.current = false; setState("thinking");
    if (followUp.current) clearTimeout(followUp.current);
    paused.current = true; stopRec();
    void speak(ACKS[Math.floor(Math.random() * ACKS.length)], voice);
    try {
      history.current = [...history.current.slice(-8), { role: "user", content: q }];
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.current, voice: true }) });
      const data = await res.json();
      const text: string = data.error ? `Something went wrong: ${data.error}` : data.text;
      history.current = [...history.current, { role: "assistant", content: text }];
      if (data.navigate) router.push(data.navigate);
      const [first, ...rest] = text.split(/\n-{3,}\n/);
      const spoken = firstSentences(first, 2);
      await say(spoken, rest.length ? `${first.trim()}\n\n${rest.join("\n---\n").trim()}` : text, data.steps ?? []);
      // Keep listening for a follow-up without the wake word.
      awake.current = true; setState("awake"); setHeard(""); segments.current = [];
      followUp.current = setTimeout(() => { awake.current = false; segments.current = []; setState("reply"); }, FOLLOW_UP_MS);
    } catch (e) {
      await say("I could not reach the assistant.", `Could not reach the assistant: ${e instanceof Error ? e.message : String(e)}`, []);
    }
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => { setState("idle"); setReply(null); setHeard(""); }, 45_000);
  }

  if (!supported) return null;
  const label = !on ? "Voice off" : state === "idle" ? `Say "${wakeWord}"` : state === "awake" ? "Listening" : state === "thinking" ? "Thinking" : state === "speaking" ? "Speaking" : "Voice on";
  return (
    <>
      <button onClick={() => setOn(!on)} className={`pressable fixed z-30 bottom-20 right-4 md:bottom-6 md:right-6 card px-3.5 py-2.5 flex items-center gap-2 text-xs ${on ? "" : "opacity-70"}`} aria-label={on ? "Turn voice off" : "Turn voice on"}>
        <Waveform size={16} className={on && (state === "idle" || state === "awake") ? "pulse" : ""} />
        {label}
      </button>
      {on && state !== "idle" && (
        <div className="fixed z-30 bottom-32 right-4 md:bottom-20 md:right-6 w-[min(92vw,26rem)] card p-4 grid gap-2 rise" style={{ ["--i" as string]: 0 }}>
          <div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{name ? `${name} · ` : ""}{state === "awake" ? "listening…" : state === "thinking" ? "working…" : state === "speaking" ? "speaking" : reply?.steps.join(" · ") || "reply"}</div>
          {heard && state === "awake" && <div className="text-sm" style={{ color: "var(--muted)" }}>“{heard}”</div>}
          {reply && state !== "awake" && <div className="text-sm max-h-72 overflow-y-auto"><Markdown body={reply.text} /></div>}
        </div>
      )}
    </>
  );
}

function firstSentences(text: string, n: number): string {
  const clean = text.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  return parts ? parts.slice(0, n).join("").trim() : clean.slice(0, 220);
}

type SREvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onstart: () => void; onresult: (e: SREvent) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
type SRCtor = new () => SpeechRecognitionLike;
