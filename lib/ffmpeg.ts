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
  // Try ffprobe first; some bundled builds crash on MPEG-TS, so fall back to
  // parsing ffmpeg's own Duration line.
  try {
    const { stdout } = await execFileAsync(
      ffprobePath,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { maxBuffer: MAX_BUFFER }
    );
    const duration = parseFloat(stdout.trim());
    if (isFinite(duration) && duration > 0) return duration;
  } catch {
    // fall through to ffmpeg
  }

  const stderr: string = await execFileAsync(
    ffmpegPath,
    ["-hide_banner", "-i", file],
    { maxBuffer: MAX_BUFFER }
  ).then(
    (r) => r.stderr,
    // ffmpeg exits non-zero when no output is given; the info is in stderr
    (err) => err?.stderr ?? ""
  );
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("Could not read video duration");
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
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

  // Hybrid seek: jump to a keyframe well before the cut point, then decode
  // forward to the exact frame. A plain fast seek into MPEG-TS lands mid-GOP,
  // which shows up as frozen/garbled frames at the start of the clip.
  const preSeek = Math.min(start, 20);

  await ffmpeg([
    "-ss", String(start - preSeek),
    "-i", input,
    "-ss", String(preSeek),
    "-t", String(Math.max(0.5, end - start)),
    "-vf", filter,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    // loudnorm resamples to 192kHz internally — bring it back down, and force
    // stereo so mono sources match the end card for concatenation
    "-ar", "48000",
    "-ac", "2",
    // Stream-recorded VODs (MPEG-TS) interleave A/V loosely; deep seeks can
    // overflow the default muxing queue ("Too many packets buffered")
    "-max_muxing_queue_size", "9999",
    "-avoid_negative_ts", "make_zero",
    // Don't let a longer audio tail hold the last video frame frozen
    "-shortest",
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

/** Escape a path for use inside an ffmpeg filter argument. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Render the promo end card: a solid background with the promo text (as an
 * ASS overlay, same renderer as captions) and silent audio, encoded to match
 * the clip format so the two can be concatenated.
 */
export async function renderEndCard(
  assFile: string,
  output: string,
  durationSec: number,
  bgColor = "0x0e0e16"
): Promise<void> {
  const d = Math.min(10, Math.max(1, durationSec));
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=${bgColor}:s=1080x1920:d=${d}:r=30`,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-t", String(d),
    "-vf", `ass='${escapeFilterPath(assFile)}',fade=t=in:st=0:d=0.25`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    output,
  ]);
}

/** Concatenate the clip and the end card (re-encodes once). */
export async function appendEndCard(
  clip: string,
  endCard: string,
  output: string
): Promise<void> {
  await ffmpeg([
    "-i", clip,
    "-i", endCard,
    "-filter_complex",
    "[0:v]setsar=1[v0];[1:v]setsar=1[v1];" +
      "[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];" +
      "[1:a]aresample=48000,aformat=channel_layouts=stereo[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  ]);
}

/** Burn an ASS subtitle file into the video. */
export async function burnSubtitles(
  input: string,
  assFile: string,
  output: string
): Promise<void> {
  await ffmpeg([
    "-i", input,
    "-vf", `ass='${escapeFilterPath(assFile)}'`,
    "-max_muxing_queue_size", "9999",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "copy",
    "-movflags", "+faststart",
    output,
  ]);
}
