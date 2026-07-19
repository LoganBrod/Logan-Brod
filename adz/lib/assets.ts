import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ASSETS_DIR, DATA_DIR, WORK_DIR, ensureDirs } from "./paths";
import { getAd, updateAd } from "./store";

const execFileAsync = promisify(execFile);
/* eslint-disable @typescript-eslint/no-var-requires */
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;

const MAX_BUFFER = 64 * 1024 * 1024;
const SCENE_MIN_SEC = 2.5;

async function ffmpeg(args: string[]) {
  return execFileAsync(ffmpegPath, ["-hide_banner", "-y", ...args], {
    maxBuffer: MAX_BUFFER,
  });
}

function requireOpenAI(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Asset generation needs OPENAI_API_KEY set in .env.local (images + voiceover)"
    );
  }
  return key;
}

/** Generate a 1024x1536 (9:16-ish) ad visual and save it as PNG. */
async function generateImage(prompt: string, outPath: string): Promise<void> {
  const key = requireOpenAI();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: `Advertising visual, no text or words anywhere in the image. ${prompt}`,
      size: "1024x1536",
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image data");
  await fs.writeFile(outPath, Buffer.from(b64, "base64"));
}

/** Generate a voiceover MP3 from the script. */
async function generateVoiceover(text: string, outPath: string): Promise<void> {
  const key = requireOpenAI();
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voiceover failed (${res.status}): ${await res.text()}`);
  }
  await fs.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function audioDuration(file: string): Promise<number> {
  const stderr: string = await execFileAsync(
    ffmpegPath,
    ["-hide_banner", "-i", file],
    { maxBuffer: MAX_BUFFER }
  ).then(
    (r) => r.stderr,
    (err) => err?.stderr ?? ""
  );
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("Could not read audio duration");
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `0:${pad(m)}:${pad(sec)}.${pad(cs)}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Overlay ASS: one bold centered line per scene, timed to the scene windows. */
function buildOverlayAss(
  overlays: { text: string; start: number; end: number }[]
): string {
  const fit = (text: string) =>
    Math.round(Math.max(40, Math.min(84, 960 / (0.54 * Math.max(1, text.length)))));
  const lines = overlays
    .filter((o) => o.text.trim())
    .map(
      (o) =>
        `Dialogue: 0,${assTime(o.start)},${assTime(o.end)},Ad,,0,0,0,,{\\an5\\pos(540,1500)\\fs${fit(o.text)}}${escapeAss(o.text)}`
    )
    .join("\n");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Ad,Arial,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,5,1,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines}
`;
}

/**
 * Build assets for an ad, fire-and-forget (status persisted on the record).
 * Image ads: one generated visual. Video ads: a scene image per script line,
 * TTS voiceover, and a ken-burns 9:16 video with timed text overlays.
 */
export async function buildAssets(adId: string): Promise<void> {
  ensureDirs();
  const ad = getAd(adId);
  if (!ad) return;
  const dir = path.join(ASSETS_DIR, adId);
  await fs.mkdir(dir, { recursive: true });
  const rel = (p: string) => path.relative(DATA_DIR, p);

  updateAd(adId, { assets: { status: "generating", images: [] } });
  try {
    if (ad.format === "image" || !ad.creative.videoScript?.length) {
      const img = path.join(dir, "ad.png");
      await generateImage(ad.creative.visualDescription, img);
      updateAd(adId, { assets: { status: "ready", images: [rel(img)] } });
      return;
    }

    // Video ad: scene images
    const scenes = ad.creative.videoScript;
    const imagePaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const img = path.join(dir, `scene${i}.png`);
      await generateImage(scenes[i].visual, img);
      imagePaths.push(img);
      updateAd(adId, {
        assets: { status: "generating", images: imagePaths.map(rel) },
      });
    }

    // Voiceover
    const vo = path.join(dir, "voiceover.mp3");
    await generateVoiceover(scenes.map((s) => s.voiceover).join(" ... "), vo);
    const voDur = await audioDuration(vo);
    const sceneDur = Math.max(SCENE_MIN_SEC, (voDur + 0.6) / scenes.length);

    // Each scene: still image -> ken-burns pan/zoom clip
    const sceneClips: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const clip = path.join(WORK_DIR, `${adId}-scene${i}.mp4`);
      const frames = Math.round(sceneDur * 30);
      await ffmpeg([
        "-loop", "1",
        "-i", imagePaths[i],
        "-t", sceneDur.toFixed(2),
        "-vf",
        `scale=1440:2560,zoompan=z='min(zoom+0.0012,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        clip,
      ]);
      sceneClips.push(clip);
    }

    // Concat scenes + overlay text + voiceover
    const overlays = scenes.map((s, i) => ({
      text: s.overlayText,
      start: i * sceneDur + 0.15,
      end: (i + 1) * sceneDur - 0.15,
    }));
    const assPath = path.join(WORK_DIR, `${adId}.ass`);
    await fs.writeFile(assPath, buildOverlayAss(overlays));

    const video = path.join(dir, "ad.mp4");
    const inputs = sceneClips.flatMap((c) => ["-i", c]);
    const concatFilter =
      sceneClips.map((_, i) => `[${i}:v]`).join("") +
      `concat=n=${sceneClips.length}:v=1:a=0[cat];` +
      `[cat]ass='${escapeFilterPath(assPath)}'[v]`;
    await ffmpeg([
      ...inputs,
      "-i", vo,
      "-filter_complex", concatFilter,
      "-map", "[v]",
      "-map", `${sceneClips.length}:a:0`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      video,
    ]);

    updateAd(adId, {
      assets: {
        status: "ready",
        images: imagePaths.map(rel),
        video: rel(video),
        voiceover: rel(vo),
      },
    });
    for (const c of sceneClips) await fs.rm(c, { force: true }).catch(() => {});
    await fs.rm(assPath, { force: true }).catch(() => {});
  } catch (err) {
    updateAd(adId, {
      assets: {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        images: getAd(adId)?.assets?.images ?? [],
      },
    });
  }
}
