"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Waveform } from "@phosphor-icons/react";
import { Markdown } from "./Markdown";
import { speak, stopSpeaking, warmVoices } from "@/lib/speak";

const ACKS = ["On it.", "One moment.", "Let me look.", "Checking."];

/**
 * Always-on voice: listens for the wake word on every page, sends what follows to the
 * assistant, speaks the reply, and follows any page the assistant opens. Browser speech
 * recognition only (Chrome, Safari); it runs while a tab of the app is open.
 */
export function Jarvis({ wakeWord, name, voice, greeting }: { wakeWord: string; name: string; voice?: string; greeting?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "awake" | "thinking" | "reply">("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<{ text: string; steps: string[] } | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const awake = useRef(false);
  const onRef = useRef(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition;
    setSupported(Boolean(SR));
    warmVoices();
    try { setOn(localStorage.getItem("jarvis") === "on"); } catch {}
  }, []);

  useEffect(() => {
    onRef.current = on;
    try { localStorage.setItem("jarvis", on ? "on" : "off"); } catch {}
    if (!on) { rec.current?.stop(); rec.current = null; setState("idle"); return; }
    const SR = (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    const wake = wakeWord.toLowerCase();
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const text = Array.from(last).map((x) => x.transcript).join("").trim();
      const lower = text.toLowerCase();
      if (!awake.current) {
        const i = lower.indexOf(wake);
        if (i < 0) return;
        awake.current = true; setState("awake"); setReply(null);
        stopSpeaking();
        const rest = text.slice(i + wake.length).replace(/^[,.\s]+/, "");
        setHeard(rest);
        if (last.isFinal && rest.split(/\s+/).filter(Boolean).length >= 2) ask(rest);
        return;
      }
      const i = lower.indexOf(wake);
      const rest = (i >= 0 ? text.slice(i + wake.length) : text).replace(/^[,.\s]+/, "");
      setHeard(rest);
      if (last.isFinal && rest.trim()) ask(rest);
    };
    r.onend = () => { if (onRef.current) { try { r.start(); } catch {} } }; // Chrome stops after silence; keep going
    r.onerror = () => {};
    try { r.start(); } catch {}
    rec.current = r;
    // First time on the app today with voice on: say hello, once.
    const key = `jarvis-greeted-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (greeting && !localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setReply({ text: greeting, steps: [] }); setState("reply");
        void speak(greeting, voice);
        if (hide.current) clearTimeout(hide.current);
        hide.current = setTimeout(() => { setState("idle"); setReply(null); }, 20_000);
      }
    } catch {}
    return () => { r.onend = () => {}; r.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, wakeWord]);

  async function ask(q: string) {
    awake.current = false; setState("thinking");
    if (followUp.current) clearTimeout(followUp.current);
    void speak(ACKS[Math.floor(Math.random() * ACKS.length)], voice); // no dead air while it works
    try {
      history.current = [...history.current.slice(-8), { role: "user", content: q }];
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.current, voice: true }) });
      const data = await res.json();
      const text: string = data.error ? `Something went wrong: ${data.error}` : data.text;
      history.current = [...history.current, { role: "assistant", content: text }];
      // The reply is "what to say" then optionally "---" and what to show.
      const [spoken, ...rest] = text.split(/\n-{3,}\n/);
      setReply({ text: rest.length ? `${spoken.trim()}\n\n${rest.join("\n---\n").trim()}` : text, steps: data.steps ?? [] }); setState("reply");
      if (data.navigate) router.push(data.navigate);
      await speak(spoken, voice);
      // Stay awake briefly so a follow-up needs no wake word.
      awake.current = true; setState("awake"); setHeard("");
      followUp.current = setTimeout(() => { awake.current = false; setState("reply"); }, 8_000);
    } catch (e) {
      setReply({ text: `Could not reach the assistant: ${e instanceof Error ? e.message : String(e)}`, steps: [] }); setState("reply");
    }
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => { setState("idle"); setReply(null); setHeard(""); }, 45_000);
  }

  if (!supported) return null;
  return (
    <>
      <button onClick={() => setOn(!on)} className={`pressable fixed z-30 bottom-20 right-4 md:bottom-6 md:right-6 card px-3.5 py-2.5 flex items-center gap-2 text-xs ${on ? "" : "opacity-70"}`} aria-label={on ? "Turn voice off" : "Turn voice on"}>
        <Waveform size={16} className={on && state === "idle" ? "pulse" : ""} />
        {on ? (state === "idle" ? `Say "${wakeWord}"` : state === "awake" ? "Listening" : state === "thinking" ? "Thinking" : "Voice on") : "Voice off"}
      </button>
      {on && state !== "idle" && (
        <div className="fixed z-30 bottom-32 right-4 md:bottom-20 md:right-6 w-[min(92vw,26rem)] card p-4 grid gap-2 rise" style={{ ["--i" as string]: 0 }}>
          <div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{name ? `${name} · ` : ""}{state === "awake" ? "listening…" : state === "thinking" ? "working…" : reply?.steps.join(" · ") || "reply"}</div>
          {heard && <div className="text-sm" style={{ color: "var(--muted)" }}>“{heard}”</div>}
          {reply && <div className="text-sm max-h-72 overflow-y-auto"><Markdown body={reply.text} /></div>}
        </div>
      )}
    </>
  );
}

type SREvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: SREvent) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
type SRCtor = new () => SpeechRecognitionLike;
