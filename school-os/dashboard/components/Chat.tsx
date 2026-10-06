"use client";
import { readJson, showOnDesk, type DeskItem } from "@/lib/client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Microphone, PaperPlaneRight, SpeakerHigh, SpeakerSlash, Trash } from "@phosphor-icons/react";
import { Markdown } from "./Markdown";
import { speak } from "@/lib/speak";

type Msg = { role: "user" | "assistant"; content: string; steps?: string[] };
const KEY = "school-os-chat";

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    try { const saved = localStorage.getItem(KEY); if (saved) setMsgs(JSON.parse(saved)); } catch {}
    const SR = (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition;
    setCanListen(Boolean(SR));
    if (SR) {
      const r = new SR();
      r.continuous = false; r.interimResults = true; r.lang = "en-US";
      r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(""); setInput(t); if (e.results[e.results.length - 1].isFinal) { setListening(false); send(t); } };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch {} bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }) });
      const data = await readJson<{ text?: string; error?: string; navigate?: string; show?: DeskItem[]; steps?: string[]; usage?: { input: number; output: number } }>(res);
      const reply = data.error ? `Error: ${data.error}` : (data.text ?? "");
      setMsgs([...next, { role: "assistant", content: reply, steps: data.steps }]);
      if (data.show?.length) showOnDesk(data.show);
      if (data.navigate) router.push(data.navigate);
      if (speakOn) void speak(reply.split(/\n-{3,}\n/)[0]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Could not reach the assistant: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setBusy(false); }
  }
  function toggleListen() {
    if (!rec.current) return;
    if (listening) { rec.current.stop(); setListening(false); return; }
    window.speechSynthesis?.cancel(); setInput(""); setListening(true); rec.current.start();
  }

  return (
    <div className="grid gap-4 max-w-3xl" style={{ gridTemplateRows: "1fr auto", minHeight: "calc(100dvh - 9rem)" }}>
      <div className="grid gap-4 content-start overflow-y-auto pr-1">
        {msgs.length === 0 && (
          <div className="card p-5 text-sm grid gap-2" style={{ color: "var(--muted)" }}>
            <div className="font-medium" style={{ color: "var(--text)" }}>Ask about anything in your notes, or tell it what to do.</div>
            <div>"Pull up the problems from calc that use the slope formula."</div>
            <div>"What did we cover in physics last week?"</div>
            <div>"Quiz me on osmosis."</div>
            <div>"Make a practice test for the econ unit and check Schoology for anything new."</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "justify-self-end max-w-[85%]" : "max-w-full"}>
            {m.role === "user" ? (
              <div className="accent-tint accent-ring rounded-2xl px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div className="grid gap-1.5">
                {m.steps && m.steps.length > 0 && <div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{m.steps.join(" · ")}</div>}
                <div className="text-[15px]"><Markdown body={m.content} /></div>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="mono text-xs" style={{ color: "var(--faint)" }}>working…</div>}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="card p-2 flex items-end gap-2 sticky bottom-20 md:bottom-4">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} rows={1} placeholder={listening ? "Listening…" : "Ask, or press the mic and talk"} className="flex-1 bg-transparent outline-none resize-none px-2 py-2 text-[15px] placeholder:text-[var(--faint)] max-h-40" />
        {canListen && <button type="button" onClick={toggleListen} className={`pressable p-2.5 rounded-xl ${listening ? "accent-bg" : "card-2"}`} aria-label="Talk"><Microphone size={18} /></button>}
        <button type="button" onClick={() => setSpeak(!speakOn)} className={`pressable p-2.5 rounded-xl ${speakOn ? "accent-bg" : "card-2"}`} aria-label="Read replies aloud">{speakOn ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}</button>
        <button type="button" onClick={() => { setMsgs([]); try { localStorage.removeItem(KEY); } catch {} }} className="pressable p-2.5 rounded-xl card-2" aria-label="Clear"><Trash size={18} /></button>
        <button type="submit" disabled={busy || !input.trim()} className="pressable p-2.5 rounded-xl accent-bg disabled:opacity-40" aria-label="Send"><PaperPlaneRight size={18} /></button>
      </form>
    </div>
  );
}

type SREvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: SREvent) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
type SRCtor = new () => SpeechRecognitionLike;
