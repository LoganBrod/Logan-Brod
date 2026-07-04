import { execFile } from "child_process";
import { promisify } from "util";
import type { Highlight } from "./store";

const execFileAsync = promisify(execFile);

// These packages ship prebuilt ffmpeg/ffprobe binaries inside the npm tarball
// itself (no postinstall download), so no system install is needed.
/* eslint-disable @typescript-eslint/no-var-requires */
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath: string = require("@ffprobe-installer/ffprobe").path;

const MAX_BUFFER = 64 * 1024 * 1024;

async function ffmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(ffmpegPath, ["-hide_banner", "-y", ...args], {
    maxBuffer: MAX_BUFFER,
  });
}

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { maxBuffer: MAX_BUFFER }
  );
  const duration = parseFloat(stdout.trim());
  if (!isFinite(duration)) throw new Error("Could not read video duration");
  return duration;
}

/**
 * Find the loudest moments in the video's audio track. Big wins on stream are
 * almost always the loudest — screaming, alerts, hype music. Computes RMS
 * loudness per second and returns the top peaks, spaced apart so several
 * suggestions don't cover the same moment.
 */
export async function detectHighlights(
  file: string,
  duration: number,
  count = 6
): Promise<Highlight[]> {
  const { stdout } = await ffmpeg([
    "-i", file,
    "-map", "0:a:0",
    "-af",
    "aresample=48000,asetnsamples=n=48000,astats=metadata=1:reset=1," +
      "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f", "null", "-",
  ]);

  // Output alternates lines like:
  //   frame:12 pts:576000 pts_time:12
  //   lavfi.astats.Overall.RMS_level=-23.42
  const seconds: { time: number; rms: number }[] = [];
  let currentTime: number | null = null;
  for (const line of stdout.split("\n")) {
    const timeMatch = line.match(/pts_time:([\d.]+)/);
    if (timeMatch) {
      currentTime = parseFloat(timeMatch[1]);
      continue;
    }
    const rmsMatch = line.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (rmsMatch && currentTime !== null) {
      const rms = rmsMatch[1] === "-inf" ? -90 : parseFloat(rmsMatch[1]);
      seconds.push({ time: currentTime, rms });
      currentTime = null;
    }
  }
  if (seconds.length === 0) return [];

  const min = Math.min(...seconds.map((s) => s.rms));
  const max = Math.max(...seconds.map((s) => s.rms));
  const range = max - min || 1;

  const sorted = [...seconds].sort((a, b) => b.rms - a.rms);
  const MIN_GAP = 25; // seconds between suggested highlights
  const peaks: Highlight[] = [];
  for (const s of sorted) {
    if (peaks.length >= count) break;
    if (peaks.some((p) => Math.abs(p.time - s.time) < MIN_GAP)) continue;
    peaks.push({
      time: s.time,
      score: (s.rms - min) / range,
      // Lead into the moment, then hold for the payoff/reaction
      suggestedStart: Math.max(0, s.time - 12),
      suggestedEnd: Math.min(duration, s.time + 10),
    });
  }
  return peaks.sort((a, b) => a.time - b.time);
}

/**
 * Cut a segment and reformat it to 9:16 (1080x1920).
 * - "crop": center-crop to vertical (best when the action is centered)
 * - "blur": full frame scaled down over a blurred, zoomed copy of itself
 */
export async function cutClip(
  input: string,
  output: string,
  start: number,
  end: number,
  cropMode: "crop" | "blur"
): Promise<void> {
  const filter =
    cropMode === "crop"
      ? "crop=ih*9/16:ih,scale=1080:1920,setsar=1"
      : "split[bg][fg];" +
        "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bgb];" +
        "[fg]scale=1080:-2[fgs];" +
        "[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1";

  await ffmpeg([
    "-ss", String(start),
    "-t", String(Math.max(0.5, end - start)),
    "-i", input,
    "-vf", filter,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    // Stream-recorded VODs (MPEG-TS) interleave A/V loosely; deep seeks can
    // overflow the default muxing queue ("Too many packets buffered")
    "-max_muxing_queue_size", "9999",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  ]);
}

/** Extract mono compressed audio for transcription (Whisper accepts up to 25MB). */
export async function extractAudio(input: string, output: string): Promise<void> {
  await ffmpeg([
    "-i", input,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "48k",
    output,
  ]);
}

/** Burn an ASS subtitle file into the video. */
export async function burnSubtitles(
  input: string,
  assFile: string,
  output: string
): Promise<void> {
  // The ass filter parses its argument, so escape filter-special characters.
  const escaped = assFile.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await ffmpeg([
    "-i", input,
    "-vf", `ass='${escaped}'`,
    "-max_muxing_queue_size", "9999",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "copy",
    "-movflags", "+faststart",
    output,
  ]);
}
