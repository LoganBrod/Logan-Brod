import fs from "fs/promises";
import path from "path";
import { CLIPS_DIR, DATA_DIR, WORK_DIR, ensureDirs } from "./paths";
import { getClip, getPromoSettings, getVideo, updateClip } from "./store";
import {
  appendEndCard,
  burnSubtitles,
  cutClip,
  extractAudio,
  renderEndCard,
} from "./ffmpeg";
import { transcribe } from "./transcribe";
import { buildAss } from "./subtitles";
import { buildEndCardAss } from "./endcard";
import { generateHooks } from "./hooks";
import { postClipToX, xConfigured } from "./postx";

/**
 * Full clip pipeline: cut/reframe -> transcribe -> burn captions -> append
 * promo end card -> generate hooks. Each stage persists status to the store
 * so the UI can poll progress. Runs fire-and-forget from the API route;
 * errors land on the clip record.
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
  const work = (suffix: string) => path.join(WORK_DIR, `${clipId}${suffix}`);
  const tempFiles = [
    work("-cut.mp4"),
    work("-cap.mp4"),
    work("-card.mp4"),
    work(".mp3"),
    work(".ass"),
    work("-card.ass"),
  ];

  try {
    // 1. Cut + reframe to 9:16
    updateClip(clipId, { status: "cutting" });
    let current = work("-cut.mp4");
    await cutClip(source, current, clip.start, clip.end, clip.cropMode);

    // 2. Transcribe (needed for both captions and hooks)
    let transcriptText = "";
    updateClip(clipId, { status: "transcribing" });
    try {
      await extractAudio(current, work(".mp3"));
      const transcript = await transcribe(work(".mp3"));
      if (transcript) {
        transcriptText = transcript.text;
        updateClip(clipId, { transcript: transcriptText });

        // 3. Burn captions
        if (clip.captions && transcript.words.length > 0) {
          updateClip(clipId, { status: "captioning" });
          await fs.writeFile(work(".ass"), buildAss(transcript.words));
          await burnSubtitles(current, work(".ass"), work("-cap.mp4"));
          current = work("-cap.mp4");
        }
      }
    } catch (err) {
      // Captions are best-effort — a failed transcription shouldn't kill the clip
      console.error(`Transcription/captioning failed for clip ${clipId}:`, err);
    }

    // 4. Promo end card
    const promo = getPromoSettings();
    if (clip.endCard && promo.enabled) {
      updateClip(clipId, { status: "end_card" });
      try {
        await fs.writeFile(work("-card.ass"), buildEndCardAss(promo, promo.durationSec));
        await renderEndCard(work("-card.ass"), work("-card.mp4"), promo.durationSec);
        await appendEndCard(current, work("-card.mp4"), finalPath);
      } catch (err) {
        // End card is best-effort too — ship the plain clip if it fails
        console.error(`End card failed for clip ${clipId}:`, err);
        await fs.copyFile(current, finalPath);
      }
    } else {
      await fs.copyFile(current, finalPath);
    }
    updateClip(clipId, { file: path.relative(DATA_DIR, finalPath) });

    // 5. Hooks + caption via Claude
    updateClip(clipId, { status: "writing_hooks" });
    try {
      const result = await generateHooks(
        transcriptText,
        clip.notes,
        promo.enabled ? promo.main : undefined
      );
      if (result) {
        updateClip(clipId, { hooks: result.hooks, caption: result.caption });
      }
    } catch (err) {
      console.error(`Hook generation failed for clip ${clipId}:`, err);
    }

    // 6. Auto-post to X (approval mode when off — clip just waits in the queue)
    if (clip.autoPost && xConfigured()) {
      updateClip(clipId, { status: "posting" });
      try {
        await postClipToX(clipId);
      } catch (err) {
        updateClip(clipId, {
          error: `Auto-post failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    updateClip(clipId, { status: "ready" });
  } catch (err) {
    updateClip(clipId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    for (const f of tempFiles) {
      await fs.rm(f, { force: true }).catch(() => {});
    }
  }
}

/** Regenerate hooks for an existing clip without reprocessing the video. */
export async function regenerateHooks(clipId: string): Promise<void> {
  const clip = getClip(clipId);
  if (!clip) return;
  const promo = getPromoSettings();
  updateClip(clipId, { status: "writing_hooks" });
  try {
    const result = await generateHooks(
      clip.transcript ?? "",
      clip.notes,
      promo.enabled ? promo.main : undefined
    );
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
