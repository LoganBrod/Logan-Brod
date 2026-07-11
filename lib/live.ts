import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { DATA_DIR, ensureDirs } from "./paths";
import {
  addClip,
  addLiveSession,
  addVideo,
  getAutoPost,
  getPromoSettings,
  pushLiveEvent,
  updateLiveSession,
  updateVideo,
  type Clip,
  type LiveSession,
} from "./store";
import { processClip } from "./pipeline";
import { measureRms } from "./ffmpeg";
import { resolveKickStream } from "./kick";

// Detection tuning
const WARMUP_SEC = 20; // learn the stream's baseline loudness first
const SPIKE_DB = 8; // how far above baseline counts as a moment
const COOLDOWN_SEC = 45; // min gap between auto-clips
const PRE_ROLL = 15; // seconds of lead-in before the spike
const POST_ROLL = 10; // seconds kept after the spike
const POLL_MS = 2000;
const MAX_FAILURES = 15; // consecutive playlist/segment failures before giving up
const MAX_SESSION_HOURS = 12;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LevoZ";

interface ActiveWatch {
  stopped: boolean;
}

// In-process registry of running watchers (Next.js keeps one Node process;
// stale "live" sessions from a previous process are fixed in reconcileSessions)
const globalAny = globalThis as unknown as { __levozWatchers?: Map<string, ActiveWatch> };
const active = (globalAny.__levozWatchers ??= new Map<string, ActiveWatch>());

export function isWatcherActive(id: string): boolean {
  return active.has(id);
}

/** Mark sessions from a dead process as stopped so the UI doesn't lie. */
export function reconcileSessions(sessions: LiveSession[]): LiveSession[] {
  for (const s of sessions) {
    if ((s.status === "live" || s.status === "connecting") && !active.has(s.id)) {
      updateLiveSession(s.id, {
        status: "stopped",
        stoppedAt: new Date().toISOString(),
      });
      s.status = "stopped";
    }
  }
  return sessions;
}

export async function startWatch(input: string): Promise<LiveSession> {
  ensureDirs();
  const isUrl = /^https?:\/\//i.test(input.trim()) && input.includes(".m3u8");
  const channel = isUrl ? input.trim() : input.trim().toLowerCase();
  const m3u8 = isUrl ? input.trim() : await resolveKickStream(channel);

  const id = crypto.randomUUID().slice(0, 8);
  const liveDir = path.join(DATA_DIR, "live", id);
  fs.mkdirSync(liveDir, { recursive: true });
  const recPath = path.join(liveDir, "rec.m2ts");
  fs.writeFileSync(recPath, "");

  const label = isUrl ? "stream" : channel;
  addVideo({
    id,
    filename: `🔴 LIVE ${label} — ${new Date().toLocaleString()}`,
    file: path.relative(DATA_DIR, recPath),
    duration: 0,
    createdAt: new Date().toISOString(),
  });

  const session: LiveSession = {
    id,
    channel: isUrl ? "(direct stream URL)" : channel,
    status: "connecting",
    videoId: id,
    startedAt: new Date().toISOString(),
    events: [
      { at: new Date().toISOString(), type: "info", text: "Connecting to stream…" },
    ],
  };
  addLiveSession(session);

  const watch: ActiveWatch = { stopped: false };
  active.set(id, watch);
  void runWatchLoop(id, m3u8, recPath, liveDir, watch);

  return session;
}

/**
 * The watcher: follows the HLS playlist, appends each new segment to the
 * growing recording (MPEG-TS segments concatenate byte-for-byte), measures
 * its loudness, and auto-clips when a segment spikes above the stream's
 * learned baseline. Downloading in Node keeps the recording timeline exactly
 * aligned with detection.
 */
async function runWatchLoop(
  id: string,
  playlistUrl: string,
  recPath: string,
  liveDir: string,
  watch: ActiveWatch
) {
  const seen = new Set<string>();
  const pendingCuts: { spikeT: number; cutAt: number }[] = [];
  let timeline = 0; // seconds of footage recorded so far
  let baseline: number | null = null;
  let lastSpikeT = -Infinity;
  let started = false;
  let failures = 0;
  let firstPoll = true;
  const deadline = Date.now() + MAX_SESSION_HOURS * 3600 * 1000;

  const segTmp = path.join(liveDir, "seg.ts");

  while (!watch.stopped && Date.now() < deadline) {
    let hadFresh = false;
    try {
      // no-store: Next.js patches global fetch with caching — a cached
      // playlist would freeze the segment list and lose live footage
      const res = await fetch(playlistUrl, {
        headers: { "User-Agent": UA },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`playlist ${res.status}`);
      const text = await res.text();
      const { segments, ended } = parsePlaylist(text, playlistUrl);

      // On the first poll the playlist already holds ~30s of the recent past —
      // skip all but the last two segments so "now" in the recording ≈ now.
      const fresh = segments.filter((s) => !seen.has(s.uri));
      const toTake = firstPoll ? fresh.slice(-2) : fresh;
      if (firstPoll) for (const s of fresh) seen.add(s.uri);
      firstPoll = false;
      hadFresh = toTake.length > 0;

      for (const seg of toTake) {
        if (watch.stopped) break;
        const segRes = await fetch(seg.uri, {
          headers: { "User-Agent": UA },
          cache: "no-store",
        });
        if (!segRes.ok) throw new Error(`segment ${segRes.status}`);
        const buf = Buffer.from(await segRes.arrayBuffer());
        await fsp.appendFile(recPath, buf);
        // Only mark seen once safely on disk — a failed segment gets retried
        seen.add(seg.uri);
        const segStart = timeline;
        timeline += seg.duration;
        updateVideo(id, { duration: timeline });

        if (!started) {
          started = true;
          updateLiveSession(id, { status: "live" });
          pushLiveEvent(id, {
            at: new Date().toISOString(),
            type: "info",
            text: "Connected — recording and listening for moments",
          });
        }

        // Loudness of just this segment
        let rms: number | null = null;
        try {
          await fsp.writeFile(segTmp, buf);
          rms = await measureRms(segTmp);
        } catch {
          // segment without readable audio — skip detection for it
        }

        if (rms !== null) {
          if (baseline === null) {
            baseline = rms;
          } else {
            const mid = segStart + seg.duration / 2;
            const isSpike =
              timeline > WARMUP_SEC &&
              mid - lastSpikeT > COOLDOWN_SEC &&
              rms > baseline + SPIKE_DB;
            if (isSpike) {
              lastSpikeT = mid;
              pushLiveEvent(id, {
                at: new Date().toISOString(),
                type: "spike",
                text: `Loud moment at ${fmtTime(mid)} (+${(rms - baseline).toFixed(1)} dB) — clipping…`,
              });
              pendingCuts.push({ spikeT: mid, cutAt: mid + POST_ROLL + 2 });
            } else {
              // Don't let spikes drag the baseline up
              baseline = baseline * 0.95 + Math.min(rms, baseline + 3) * 0.05;
            }
          }
        }

        // Cut any clips whose footage now fully exists on disk
        while (pendingCuts.length > 0 && timeline >= pendingCuts[0].cutAt) {
          const { spikeT } = pendingCuts.shift()!;
          cutLiveClip(id, spikeT);
        }
      }

      failures = 0;
      if (ended) {
        finish("Stream ended — recording kept, clips still available");
        return;
      }
    } catch (err) {
      failures++;
      if (failures >= MAX_FAILURES) {
        active.delete(id);
        updateLiveSession(id, {
          status: started ? "stopped" : "error",
          stoppedAt: new Date().toISOString(),
          error: started
            ? undefined
            : `Couldn't read the stream: ${err instanceof Error ? err.message : String(err)}`,
        });
        pushLiveEvent(id, {
          at: new Date().toISOString(),
          type: started ? "info" : "error",
          text: started
            ? "Stream became unreachable — recording kept"
            : "Failed to read stream",
        });
        return;
      }
    }
    // If we just ingested fresh segments, poll again immediately — sleeping
    // while behind lets segments slide out of the live playlist window
    if (!hadFresh) await sleep(POLL_MS);
  }

  finish(
    watch.stopped
      ? "Stopped watching — recording kept in your footage library"
      : "Max session length reached — recording kept"
  );

  function finish(message: string) {
    // Flush any clips still waiting on post-roll footage
    while (pendingCuts.length > 0) {
      const { spikeT } = pendingCuts.shift()!;
      if (timeline > spikeT + 2) cutLiveClip(id, spikeT, timeline);
    }
    active.delete(id);
    updateLiveSession(id, { status: "stopped", stoppedAt: new Date().toISOString() });
    pushLiveEvent(id, { at: new Date().toISOString(), type: "info", text: message });
    fsp.rm(segTmp, { force: true }).catch(() => {});
  }
}

function parsePlaylist(
  text: string,
  baseUrl: string
): { segments: { uri: string; duration: number }[]; ended: boolean } {
  const segments: { uri: string; duration: number }[] = [];
  let duration = 4;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const inf = line.match(/^#EXTINF:([\d.]+)/);
    if (inf) {
      duration = parseFloat(inf[1]);
      continue;
    }
    if (line.startsWith("#")) continue;
    segments.push({ uri: new URL(line, baseUrl).href, duration });
  }
  return { segments, ended: text.includes("#EXT-X-ENDLIST") };
}

function cutLiveClip(sessionId: string, spikeT: number, maxEnd = Infinity) {
  const clip: Clip = {
    id: crypto.randomUUID().slice(0, 8),
    videoId: sessionId,
    start: Math.max(0, spikeT - PRE_ROLL),
    end: Math.min(spikeT + POST_ROLL, maxEnd),
    cropMode: "crop",
    captions: true,
    endCard: getPromoSettings().enabled,
    autoPost: getAutoPost(),
    notes: `Auto-clipped from live stream (loud moment at ${fmtTime(spikeT)})`,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  addClip(clip);
  pushLiveEvent(sessionId, {
    at: new Date().toISOString(),
    type: "clip",
    text: `Clip queued: ${fmtTime(clip.start)} → ${fmtTime(clip.end)}`,
    clipId: clip.id,
  });
  void processClip(clip.id);
}

export function stopWatch(id: string): boolean {
  const watch = active.get(id);
  if (!watch) return false;
  watch.stopped = true;
  return true;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtTime(t: number) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
