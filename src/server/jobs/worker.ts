// src/server/jobs/worker.ts
import {
  dbGetJob,
  dbSetJobCaptionDrafts,
  dbSetJobCaptionedResults,
  dbSetJobClips,
  dbSetJobPreviewClips,
  dbSetJobReviewReady,
  dbSetJobSmartCrops,
  dbSetJobTextOverlays,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@/server/jobs/jobsDb";
import path from "path";
import { uploadLocalFileToStorage } from "@/server/storage/upload";

import { downloadVideoFromUrl } from "@server/video/download";
import {
  concatClipsToSingleVideo,
  createClipsFromVideo,
  createClipsFromVideoUsingRanges,
} from "@server/video/clip";
import { renderPreviewClips, renderShortsWithSubtitles } from "@server/video/render";
import { renderFullVideoAtSpeed } from "@server/video/fullSpeed";
import {
  analyzeTranscriptForClips,
  analyzeTranscriptForSummary,
  ClipCandidate,
} from "@server/video/scoring";
import { analyzeFaceCropsForClips, EnergyFrame } from "@server/video/faceCrop";
import { extractAudioForWhisper } from "@server/video/audio";
import { analyzeAudioEnergyForClip } from "@server/video/audioEnergy";
import { cleanupLocalJobArtifacts } from "@/server/storage/cleanup";
import { processQuoteReelJob } from "@server/jobs/processQuoteReelJob";
import { processMultiSourceEditJob } from "@server/jobs/processMultiSourceEditJob";
import {
  type CaptionDraftClip,
  generateCaptionDraftsForClips,
  generateSubtitlesFromDrafts,
} from "@server/video/caption";

type SubtitleFile = string | { path: string };
type CustomClipRange = { start: number; end: number };
type CustomClipGroup = { ranges: CustomClipRange[] };
type CustomRangeInput = {
  startSec?: unknown;
  endSec?: unknown;
  start?: unknown;
  end?: unknown;
};
type CustomClipInput = CustomRangeInput & {
  ranges?: unknown;
};

function subtitleToPath(s: SubtitleFile): string {
  return typeof s === "string" ? s : s.path;
}

function normalizeCustomClipGroups(input: unknown): CustomClipGroup[] {
  if (!Array.isArray(input)) return [];

  const groups = input
    .map((raw: unknown) => {
      const clip = (raw ?? {}) as CustomClipInput;
      const rawRanges = Array.isArray(clip.ranges) ? clip.ranges : [clip];

      const ranges = rawRanges
        .map((rangeRaw: unknown) => {
          const range = (rangeRaw ?? {}) as CustomRangeInput;

          return {
            start: Math.max(0, Number(range.startSec ?? range.start ?? 0)),
            end: Number(range.endSec ?? range.end ?? 0),
          };
        })
        .filter(
          (range: CustomClipRange) =>
            Number.isFinite(range.start) &&
            Number.isFinite(range.end) &&
            range.end > range.start &&
            range.end - range.start >= 0.6,
        )
        .sort((a: CustomClipRange, b: CustomClipRange) => a.start - b.start);

      return { ranges };
    })
    .filter((group: CustomClipGroup) => group.ranges.length > 0);

  return groups;
}

function isLocalFullSpeedOutput(shortsConfig: unknown) {
  return (
    typeof shortsConfig === "object" &&
    shortsConfig != null &&
    (shortsConfig as { outputMode?: unknown }).outputMode === "full_x2_local"
  );
}

export async function processJob(jobId: string) {
  const job = await dbGetJob(jobId);
  if (!job) {
    throw new Error(`[processJob] Job not found: ${jobId}`);
  }

  if (job.job_goal === "quote_reel") {
    await processQuoteReelJob(jobId);
    return;
  }

  if (job.job_goal === "multi_source_edit") {
    await processMultiSourceEditJob(jobId);
    return;
  }

  let downloadedVideoPath: string | null = null;
  const audioPaths: string[] = [];

  try {
    await dbUpdateJobStatus(jobId, "processing");
    await dbUpdateJobStage(jobId, "downloading", 10);

    let videoInput = job.source;

    if (job.type === "url") {
      downloadedVideoPath = await downloadVideoFromUrl(job.source);
      videoInput = downloadedVideoPath;
    }

    // derive settings from job (with safe defaults)
    const desiredClipDuration = job.clip_duration_sec ?? 30;
    const desiredMaxClips = job.max_clips ?? 3;
    const captionsEnabled = job.captions_enabled ?? true;
    const aspect = job.aspect ?? "horizontal";
    const style = job.caption_style ?? "karaoke";
    const jobGoal = (job.job_goal ?? "shorts") as "shorts" | "summary";
    const summaryTargetSec =
      typeof job.summary_target_sec === "number" ? job.summary_target_sec : 90;
    const shortsConfig = job.shorts_config ?? null;
    const isCustomSelection = !!shortsConfig && shortsConfig.selectionMode === "custom";

    if (jobGoal === "shorts" && isLocalFullSpeedOutput(shortsConfig)) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Local full x2 output is disabled in production.");
      }

      await dbUpdateJobStage(jobId, "rendering", 70);
      const outputPath = await renderFullVideoAtSpeed(videoInput, {
        jobId,
        speed: 2,
      });

      await dbSetJobClips(jobId, [videoInput]);
      await dbSetJobCaptionedResults(jobId, [`local:${outputPath}`], []);
      await dbSetJobReviewReady(jobId, false);
      await dbUpdateJobStage(jobId, "finished", 100);
      await dbUpdateJobStatus(jobId, "done");

      await cleanupLocalJobArtifacts({
        downloadedVideoPath: downloadedVideoPath ?? undefined,
        clipPaths: [],
        audioPaths,
        subtitlePaths: [],
        extraPaths: [],
      });

      console.log(`[processJob] Local full x2 output created: ${outputPath}`);
      return;
    }

    // --- AI CLIP ANALYSIS ---
    await dbUpdateJobStage(jobId, "captioning", 25);

    let clips: string[] = [];
    let usedAICandidates = false;

    const extraCleanupPaths: string[] = [];

    if (jobGoal === "summary") {
      const target = summaryTargetSec;

      const desiredHighlights = Math.max(4, Math.min(10, Math.round(target / 10)));

      const segmentLenSec = Math.max(6, Math.min(14, target / desiredHighlights));

      const maxHighlights = Math.max(desiredHighlights + 5, 10);

      const ranges = await analyzeTranscriptForSummary(videoInput, {
        targetSec: target,
        segmentLenSec,
        maxHighlights,
      });

      if (!ranges.length) {
        console.warn("[processJob] No summary ranges found, falling back to legacy clipping.");
      } else {
        usedAICandidates = true;
        await dbUpdateJobStage(jobId, "scoring", 35);

        const PAD = 0.1; // tiny padding
        const clipRanges = ranges.map((r) => ({
          start: Math.max(0, r.start - PAD),
          end: r.end + PAD,
        }));

        const parts = await createClipsFromVideoUsingRanges(videoInput, clipRanges);
        extraCleanupPaths.push(...parts);

        // IMPORTANT: concat into ONE summary clip
        await dbUpdateJobStage(jobId, "clipping", 45);
        const summaryClip = await concatClipsToSingleVideo(parts);
        clips = [summaryClip];
      }
    } else {
      // existing shorts logic (as you already have)
      try {
        if (isCustomSelection) {
          if (
            !Array.isArray(shortsConfig?.customRanges) ||
            shortsConfig.customRanges.length === 0
          ) {
            throw new Error("Custom selection mode requires at least one valid range.");
          }

          console.log("[processJob] Using custom clip ranges");

          const customClipGroups = normalizeCustomClipGroups(shortsConfig.customRanges);

          if (!customClipGroups.length) {
            throw new Error("No valid custom clip ranges after validation.");
          }

          await dbUpdateJobStage(jobId, "scoring", 35);

          for (const group of customClipGroups) {
            const parts = await createClipsFromVideoUsingRanges(videoInput, group.ranges);

            if (parts.length === 0) continue;

            if (parts.length === 1) {
              clips.push(parts[0]);
              continue;
            }

            const combinedClip = await concatClipsToSingleVideo(parts);
            extraCleanupPaths.push(...parts);
            clips.push(combinedClip);
          }

          if (!clips.length) {
            throw new Error("No custom clips could be created from the provided ranges.");
          }

          usedAICandidates = true;
        } else {
          const candidates: ClipCandidate[] = await analyzeTranscriptForClips(videoInput, {
            maxClips: desiredMaxClips,
            minDurationSec: Math.max(10, desiredClipDuration - 5),
            maxDurationSec: desiredClipDuration + 10,
            targetDurationSec: desiredClipDuration,
          });

          if (candidates.length > 0) {
            usedAICandidates = true;
            await dbUpdateJobStage(jobId, "scoring", 35);

            const PAD = 2.0;
            const ranges = candidates.map((c) => ({
              start: Math.max(0, c.start - PAD),
              end: c.end + PAD,
            }));

            clips = await createClipsFromVideoUsingRanges(videoInput, ranges);
          }
        }
      } catch (err) {
        if (isCustomSelection) {
          throw err;
        }

        console.error("[processJob] Error during clip analysis/selection. Falling back:", err);
      }
    }

    // --- FALLBACK: legacy clipping ---
    if (!usedAICandidates || clips.length === 0) {
      await dbUpdateJobStage(jobId, "scoring", 30);

      if (jobGoal === "summary") {
        const one = await createClipsFromVideo(videoInput, {
          clipDurationSec: Math.min(Math.max(30, summaryTargetSec), 120),
          maxClips: 1,
        });
        clips = one;
      } else {
        if (isCustomSelection) {
          throw new Error("Custom clip ranges were provided but no valid clips could be created.");
        }

        clips = await createClipsFromVideo(videoInput, {
          clipDurationSec: desiredClipDuration,
          maxClips: desiredMaxClips,
        });
      }
    }

    await dbSetJobClips(jobId, clips);

    const energyByClip: (EnergyFrame[] | null)[] = [];

    for (const clipPath of clips) {
      try {
        const audioMp3Path = await extractAudioForWhisper(clipPath);
        audioPaths.push(audioMp3Path);
        const energyFrames = await analyzeAudioEnergyForClip(audioMp3Path);
        energyByClip.push(energyFrames);

        console.log("[processJob] energyFrames", energyFrames.slice(0, 5));
      } catch (e) {
        console.warn("[processJob] Failed to compute energy frames for clip:", clipPath, e);
        energyByClip.push(null);
      }
    }

    // --- CAPTION DRAFTS / REVIEW DATA ---
    await dbUpdateJobStage(jobId, "captioning", 50);

    const captionDrafts: CaptionDraftClip[] = await generateCaptionDraftsForClips(clips);

    await dbSetJobCaptionDrafts(jobId, captionDrafts);
    await dbSetJobTextOverlays(jobId, []);

    // --- FACE-AWARE SMART CROP (NEW) ---
    await dbUpdateJobStage(jobId, "clipping", 60);
    const smartCrops = await analyzeFaceCropsForClips(clips, energyByClip);
    await dbSetJobSmartCrops(jobId, smartCrops);

    // Shorts stop here and wait for review/edit
    if (jobGoal === "shorts") {
      await dbUpdateJobStage(jobId, "rendering", 70);

      const previewClips = await renderPreviewClips(clips, {
        aspect,
        smartCrop: smartCrops,
      });

      await dbSetJobPreviewClips(jobId, previewClips);
      await dbSetJobReviewReady(jobId, true);

      await dbUpdateJobStage(jobId, "finished", 100);
      await dbUpdateJobStatus(jobId, "done");

      await cleanupLocalJobArtifacts({
        downloadedVideoPath: downloadedVideoPath ?? undefined,
        clipPaths: [],
        audioPaths,
        subtitlePaths: [],
        extraPaths: [...extraCleanupPaths],
      });

      return;
    }

    // Summary continues to final render from drafts
    const subtitleFiles = await generateSubtitlesFromDrafts(captionDrafts, clips, {
      captionStyle: style,
      fontName: "Inter",
    });

    const subtitlePaths: string[] = Array.isArray(subtitleFiles)
      ? subtitleFiles.map(subtitleToPath).filter(Boolean)
      : [];

    // --- RENDER (WITH OR WITHOUT SUBTITLES) ---
    await dbUpdateJobStage(jobId, "rendering", 70);

    let videos: string[] = [];
    let thumbs: string[] = [];

    ({ videos, thumbs } = await renderShortsWithSubtitles(clips, subtitleFiles, {
      aspect,
      style,
      captionsEnabled,
      smartCrop: smartCrops,
    }));

    // ✅ Upload rendered videos/thumbs to Storage, store URLs in DB, cleanup local files
    const videoUrls: string[] = [];
    const thumbUrls: string[] = [];

    for (let i = 0; i < videos.length; i++) {
      const localVideoPath = videos[i];
      const localThumbPath = thumbs?.[i];

      const videoObjectPath = `jobs/${jobId}/short-${i + 1}.mp4`;
      const thumbExt = localThumbPath ? path.extname(localThumbPath) || ".jpg" : ".jpg";
      const thumbObjectPath = `jobs/${jobId}/thumb-${i + 1}${thumbExt}`;

      const uploadedVideo = await uploadLocalFileToStorage(localVideoPath, videoObjectPath);
      videoUrls.push(uploadedVideo.publicUrl); // ✅

      if (!uploadedVideo.publicUrl) {
        throw new Error("No publicUrl returned for uploaded video");
      }

      if (localThumbPath) {
        const uploadedThumb = await uploadLocalFileToStorage(localThumbPath, thumbObjectPath);
        thumbUrls.push(uploadedThumb.publicUrl); // ✅
      } else {
        thumbUrls.push("");
      }
    }

    await dbSetJobCaptionedResults(jobId, videoUrls, thumbUrls);

    await cleanupLocalJobArtifacts({
      downloadedVideoPath: downloadedVideoPath ?? undefined,
      clipPaths: clips,
      audioPaths,
      subtitlePaths,
      extraPaths: [...videos, ...(thumbs ?? []).filter(Boolean), ...extraCleanupPaths],
    });

    await dbUpdateJobStage(jobId, "finished", 100);
    await dbUpdateJobStatus(jobId, "done");
  } catch (err) {
    console.error("[processJob] Error:", err);
    await dbUpdateJobStatus(jobId, "failed");
    await dbUpdateJobStage(jobId, "finished", 100);
  }
}
