/**
 * Speech out, via the browser's built-in speechSynthesis.
 *
 * Unlike recognition, TTS genuinely runs locally in every major browser using
 * voices already installed on the OS. Nothing is uploaded, nothing is
 * downloaded, and it works offline — so there is no reason to reach for a
 * heavier option here even though the input side needed one.
 */

export interface SpeakOptions {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Prefer a natural-sounding local voice.
 *
 * Voices load asynchronously in Chrome — getVoices() often returns [] on the
 * first call, which is why this is resolved at speak time rather than cached
 * at module load.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const preferred = [/Google UK English Male/i, /Daniel/i, /Samantha/i, /Google US English/i];
  for (const pattern of preferred) {
    const match = voices.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en") && v.localService) ?? voices[0] ?? null;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // Barge-in: a new answer replaces the old one rather than queueing behind
  // it. Waiting through a stale sentence is the single most irritating thing
  // a voice assistant can do.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1.05;

  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
