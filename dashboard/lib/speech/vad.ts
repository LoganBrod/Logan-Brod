/**
 * Voice activity detection and continuous audio capture.
 *
 * Holds a rolling buffer of recent microphone audio in memory, watches the
 * signal level, and emits a segment of raw samples each time someone finishes
 * speaking. Nothing is written to disk and nothing leaves the process — the
 * caller decides what to do with each segment, and the wake-word layer throws
 * most of them away.
 *
 * Why raw PCM rather than MediaRecorder: MediaRecorder produces compressed
 * webm chunks that cannot be sliced arbitrarily, because only the first chunk
 * carries the container header. Wake-word detection needs *pre-roll* — the
 * audio from just before the level crossed the threshold, or the "J" of
 * "Jarvis" is already gone by the time detection fires. A ring buffer of raw
 * samples can be sliced anywhere.
 */

const TARGET_SAMPLE_RATE = 16_000; // what Whisper expects

export interface VadOptions {
  /** Audio from before speech was detected, so the first phoneme survives. */
  preRollMs?: number;
  /** Silence needed to consider an utterance finished. */
  hangoverMs?: number;
  /** Ignore blips shorter than this — a cough, a door, a keyboard. */
  minSpeechMs?: number;
  /** Hard cap so a television does not produce a five-minute segment. */
  maxSpeechMs?: number;
  /** How far above the measured noise floor counts as speech. */
  threshold?: number;
  onSegment: (audio: Float32Array, sampleRate: number) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  onError?: (error: Error) => void;
}

export interface VadHandle {
  stop(): void;
}

/**
 * Root mean square of a frame — its average energy, which tracks loudness far
 * better than peak amplitude does. A single click has a high peak and almost
 * no RMS; speech is the other way round.
 */
function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const s = frame[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / frame.length);
}

/** Resample to 16 kHz if the browser refused to give us that rate directly. */
async function resample(
  audio: Float32Array,
  from: number,
): Promise<Float32Array> {
  if (from === TARGET_SAMPLE_RATE) return audio;

  const frames = Math.max(
    1,
    Math.ceil((audio.length / from) * TARGET_SAMPLE_RATE),
  );
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const buffer = offline.createBuffer(1, audio.length, from);

  // Copied into a freshly allocated array rather than passed straight in.
  // Since TypeScript 5.7 Float32Array is generic over its backing buffer, and
  // copyToChannel will not accept one that might be a SharedArrayBuffer.
  const owned = new Float32Array(audio.length);
  owned.set(audio);
  buffer.copyToChannel(owned, 0);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export async function startVad(options: VadOptions): Promise<VadHandle> {
  const {
    preRollMs = 400,
    hangoverMs = 750,
    minSpeechMs = 350,
    maxSpeechMs = 12_000,
    threshold = 2.6,
    onSegment,
    onLevel,
    onError,
  } = options;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // Ask for 16 kHz directly so no resampling is needed in the common case.
  // Browsers may ignore this and hand back the hardware rate, which resample()
  // above corrects for.
  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const sampleRate = context.sampleRate;
  const source = context.createMediaStreamSource(stream);

  const FRAME = 4096;
  // ScriptProcessorNode is deprecated in favour of AudioWorklet, which runs off
  // the main thread. It is used here because it needs no separately served
  // module file and is supported everywhere, and because this callback only
  // does an RMS and a memcpy. Worth revisiting if the UI ever stutters.
  const processor = context.createScriptProcessor(FRAME, 1, 1);

  const ringSize = Math.ceil((sampleRate * (preRollMs + 200)) / 1000);
  const ring = new Float32Array(ringSize);
  let ringWrite = 0;
  let ringFilled = 0;

  let speaking = false;
  let collected: Float32Array[] = [];
  let silenceMs = 0;
  let speechMs = 0;

  // Adaptive noise floor. A fixed threshold works in one room and fails in
  // every other one — a fan, a laptop, or a street outside all move the floor.
  // This tracks the quiet level and only calls something speech when it rises
  // clearly above it.
  let noiseFloor = 0.005;
  const frameMs = (FRAME / sampleRate) * 1000;

  function pushToRing(frame: Float32Array) {
    for (let i = 0; i < frame.length; i++) {
      ring[ringWrite] = frame[i] ?? 0;
      ringWrite = (ringWrite + 1) % ringSize;
    }
    ringFilled = Math.min(ringFilled + frame.length, ringSize);
  }

  /** The ring buffer unwrapped into chronological order. */
  function readRing(): Float32Array {
    const out = new Float32Array(ringFilled);
    const start = (ringWrite - ringFilled + ringSize) % ringSize;
    for (let i = 0; i < ringFilled; i++) {
      out[i] = ring[(start + i) % ringSize] ?? 0;
    }
    return out;
  }

  function finish() {
    const total = collected.reduce((n, c) => n + c.length, 0);
    const segment = new Float32Array(total);
    let offset = 0;
    for (const chunk of collected) {
      segment.set(chunk, offset);
      offset += chunk.length;
    }

    collected = [];
    const heldMs = speechMs;
    speaking = false;
    speechMs = 0;
    silenceMs = 0;

    if (heldMs < minSpeechMs) return; // a blip, not an utterance

    void resample(segment, sampleRate)
      .then((audio) => onSegment(audio, TARGET_SAMPLE_RATE))
      .catch((err) =>
        onError?.(err instanceof Error ? err : new Error("Resample failed")),
      );
  }

  processor.onaudioprocess = (event) => {
    try {
      // Copied, because the browser reuses this buffer for the next frame.
      const frame = new Float32Array(event.inputBuffer.getChannelData(0));
      const level = rms(frame);

      if (!speaking) {
        // Track the floor only while quiet, so speech never raises it.
        noiseFloor = noiseFloor * 0.95 + level * 0.05;
        pushToRing(frame);
      }

      const isSpeech = level > Math.max(noiseFloor * threshold, 0.008);
      onLevel?.(level, isSpeech);

      if (!speaking && isSpeech) {
        speaking = true;
        speechMs = 0;
        silenceMs = 0;
        collected = [readRing()]; // pre-roll: the audio just before this frame
      }

      if (speaking) {
        collected.push(frame);
        speechMs += frameMs;
        silenceMs = isSpeech ? 0 : silenceMs + frameMs;

        if (silenceMs >= hangoverMs || speechMs >= maxSpeechMs) finish();
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error("Audio capture failed"));
    }
  };

  source.connect(processor);
  // ScriptProcessorNode only runs when connected to a destination. Routing it
  // through a silent gain node satisfies that without playing the microphone
  // back through the speakers, which would feed back immediately.
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(context.destination);

  return {
    stop() {
      processor.onaudioprocess = null;
      processor.disconnect();
      mute.disconnect();
      source.disconnect();
      void context.close();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
