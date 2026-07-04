import fs from "fs/promises";
import path from "path";
import { CLIPS_DIR, DATA_DIR, WORK_DIR, ensureDirs } from "./paths";
import { getClip, getVideo, updateClip } from "./store";
import { burnSubtitles, cutClip, extractAudio } from "./ffmpeg";
import { transcribe } from "./transcribe";
import { buildAss } from "./subtitles";
import { generateHooks } from "./hooks";

/**
 * Full clip pipeline: cut/reframe -> transcribe -> burn captions -> generate
 * hooks. Each stage persists status to the store so the UI can poll progress.
 * Runs fire-and-forget from the API route; errors land on the clip record.
 */
export async function processClip(clipId: string): Promise<void> {
  ensureDirs();
  const clip = getClip(clipId);
  if (!clip) return;
  const video = getVideo(clip.videoId);
  if (!video) {
    updateClip(clipId, { status: "error", error: "Source video not found" });
    return;
  }

  const source = path.join(DATA_DIR, video.file);
  const finalPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
  const rawPath = path.join(WORK_DIR, `${clipId}-raw.mp4`);
  const audioPath = path.join(WORK_DIR, `${clipId}.mp3`);
  const assPath = path.join(WORK_DIR, `${clipId}.ass`);

  try {
    // 1. Cut + reframe to 9:16
    updateClip(clipId, { status: "cutting" });
    const cutTarget = clip.captions ? rawPath : finalPath;
    await cutClip(source, cutTarget, clip.start, clip.end, clip.cropMode);

    // 2. Transcribe (needed for both captions and hooks)
    let transcriptText = "";
    updateClip(clipId, { status: "transcribing" });
    try {
      await extractAudio(cutTarget, audioPath);
      const transcript = await transcribe(audioPath);
      if (transcript) {
        transcriptText = transcript.text;
        updateClip(clipId, { transcript: transcriptText });

        // 3. Burn captions
        if (clip.captions && transcript.words.length > 0) {
          updateClip(clipId, { status: "captioning" });
          await fs.writeFile(assPath, buildAss(transcript.words));
          await burnSubtitles(rawPath, assPath, finalPath);
        }
      }
    } catch (err) {
      // Captions are best-effort — a failed transcription shouldn't kill the clip
      console.error(`Transcription/captioning failed for clip ${clipId}:`, err);
    }

    // If captions were requested but never burned, ship the raw cut
    if (clip.captions) {
      try {
        await fs.access(finalPath);
      } catch {
        await fs.copyFile(rawPath, finalPath);
      }
    }
    updateClip(clipId, { file: path.relative(DATA_DIR, finalPath) });

    // 4. Hooks + caption via Claude
    updateClip(clipId, { status: "writing_hooks" });
    try {
      const result = await generateHooks(transcriptText, clip.notes);
      if (result) {
        updateClip(clipId, { hooks: result.hooks, caption: result.caption });
      }
    } catch (err) {
      console.error(`Hook generation failed for clip ${clipId}:`, err);
    }

    updateClip(clipId, { status: "ready" });
  } catch (err) {
    updateClip(clipId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    for (const f of [rawPath, audioPath, assPath]) {
      await fs.rm(f, { force: true }).catch(() => {});
    }
  }
}

/** Regenerate hooks for an existing clip without reprocessing the video. */
export async function regenerateHooks(clipId: string): Promise<void> {
  const clip = getClip(clipId);
  if (!clip) return;
  updateClip(clipId, { status: "writing_hooks" });
  try {
    const result = await generateHooks(clip.transcript ?? "", clip.notes);
    if (result) {
      updateClip(clipId, { hooks: result.hooks, caption: result.caption });
    }
    updateClip(clipId, { status: "ready" });
  } catch (err) {
    updateClip(clipId, {
      status: "ready",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
