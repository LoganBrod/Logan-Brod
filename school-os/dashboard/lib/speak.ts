"use client";
// One place that turns text into speech: ElevenLabs through /api/speak when it is set up,
// otherwise the best voice the browser has. Returns a promise that resolves when done.

const PREFERRED = ["Daniel", "Oliver", "Arthur", "Google UK English Male", "Microsoft Ryan", "Alex", "Samuel"];
let current: HTMLAudioElement | null = null;

export function stopSpeaking() {
  current?.pause(); current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export async function speak(text: string, preferredVoice?: string): Promise<void> {
  const clean = text.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  // Whatever happens below, resolve within a sane time so the caller can carry on.
  const budget = 4000 + clean.length * 90;
  await Promise.race([speakInner(clean, preferredVoice), new Promise<void>((r) => setTimeout(r, budget))]);
  stopSpeaking();
}

async function speakInner(clean: string, preferredVoice?: string): Promise<void> {
  stopSpeaking();
  try {
    const res = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: clean }) });
    if (res.status === 200) {
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url); current = audio;
      await new Promise<void>((done) => { audio.onended = () => { URL.revokeObjectURL(url); done(); }; audio.onerror = () => done(); audio.play().catch(() => done()); });
      return;
    }
  } catch { /* fall back */ }
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const want = [preferredVoice, ...PREFERRED].filter(Boolean) as string[];
  const voice = want.map((w) => voices.find((v) => v.name.toLowerCase().includes(w.toLowerCase()))).find(Boolean) ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? voices.find((v) => v.lang.startsWith("en"));
  const u = new SpeechSynthesisUtterance(clean.slice(0, 900));
  if (voice) u.voice = voice;
  u.rate = 1.0; u.pitch = 0.95;
  await new Promise<void>((done) => { u.onend = () => done(); u.onerror = () => done(); window.speechSynthesis.speak(u); });
}

/** Voices load lazily in Chrome; call once early so the first speak() can pick a good one. */
export function warmVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
