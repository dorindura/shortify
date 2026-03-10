import path from "path";
import {
  dbGetJob,
  dbSetJobCaptionedResults,
  dbUpdateJobQuoteMeta,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@/server/jobs/jobsDb";
import { uploadLocalFileToStorage } from "@/server/storage/upload";
import { cleanupLocalJobArtifacts } from "@/server/storage/cleanup";
import { generateQuoteReelPlan } from "@/server/ai/quoteReelGenerator";
import { listImagesFromFolders, pickRandomImages } from "@/server/assets/quoteReelAssets";
import { renderQuoteReelFromImages } from "@/server/video/quoteReelRender";

type RawQuoteReelMeta = {
  tone?: "aggressive" | "cinematic" | "calm" | "dark";
  overlayHandle?: string;
  quote?: string;
  author?: string;
  instagramCaption?: string;
  hashtags?: string[];
  primaryFolder?: string;
  fallbackFolder?: string;
  selectedImages?: string[];
  recommendedDurationSec?: number;
  recommendedImageCount?: number;
  musicSuggestion?: {
    label: string;
    searchQuery: string;
    reason?: string;
  };
};

const UNIQUE_IMAGE_COUNT = 15;
const IMAGE_LOOPS = 2;
const SECONDS_PER_IMAGE = 0.68;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function processQuoteReelJob(jobId: string) {
  const job = await dbGetJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.job_goal !== "quote_reel") {
    throw new Error(`Job ${jobId} is not quote_reel`);
  }

  const cleanupPaths: string[] = [];
  const existingMeta: RawQuoteReelMeta = job.quote_reel_meta ?? {};

  try {
    await dbUpdateJobStatus(jobId, "processing");
    await dbUpdateJobStage(jobId, "planning", 10);

    const prompt = job.quote_prompt?.trim() || "discipline and success";
    const tone = existingMeta.tone ?? "cinematic";
    const overlayHandle = existingMeta.overlayHandle?.trim() ?? "";

    const plan = await generateQuoteReelPlan({
      prompt,
      tone,
    });

    const uniqueImageCount = UNIQUE_IMAGE_COUNT;
    const loopedImageCount = uniqueImageCount * IMAGE_LOOPS;
    const durationSec = clamp(Math.round(loopedImageCount * SECONDS_PER_IMAGE), 18, 24);

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      tone,
      overlayHandle,
      quote: plan.quote,
      author: plan.author,
      instagramCaption: plan.instagramCaption,
      hashtags: plan.hashtags,
      primaryFolder: plan.primaryFolder,
      fallbackFolder: plan.fallbackFolder,
      recommendedDurationSec: durationSec,
      recommendedImageCount: uniqueImageCount,
      musicSuggestion: plan.musicSuggestion,
    });

    await dbUpdateJobStage(jobId, "clipping", 35);

    let availableImages = await listImagesFromFolders([plan.primaryFolder]);

    if (availableImages.length < uniqueImageCount && plan.fallbackFolder) {
      const fallbackImages = await listImagesFromFolders([plan.fallbackFolder]);
      availableImages = [...availableImages, ...fallbackImages];
    }

    const selectedUniqueImages = pickRandomImages({
      images: availableImages,
      targetCount: uniqueImageCount,
    });

    const loopedImages = [...selectedUniqueImages, ...selectedUniqueImages];

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      tone,
      overlayHandle,
      quote: plan.quote,
      author: plan.author,
      instagramCaption: plan.instagramCaption,
      hashtags: plan.hashtags,
      primaryFolder: plan.primaryFolder,
      fallbackFolder: plan.fallbackFolder,
      selectedImages: selectedUniqueImages.map((img) => path.basename(img)),
      recommendedDurationSec: durationSec,
      recommendedImageCount: uniqueImageCount,
      musicSuggestion: plan.musicSuggestion,
    });

    await dbUpdateJobStage(jobId, "rendering", 65);

    const { videoPath, thumbPath } = await renderQuoteReelFromImages({
      images: loopedImages,
      secondsPerImage: SECONDS_PER_IMAGE,
      quote: plan.quote,
      author: plan.author,
      overlayHandle,
    });

    cleanupPaths.push(videoPath, thumbPath);

    await dbUpdateJobStage(jobId, "uploading", 88);

    const uploadedVideo = await uploadLocalFileToStorage(videoPath, `jobs/${jobId}/quote-reel.mp4`);

    const uploadedThumb = await uploadLocalFileToStorage(
      thumbPath,
      `jobs/${jobId}/quote-reel-thumb.jpg`,
    );

    await dbSetJobCaptionedResults(jobId, [uploadedVideo.publicUrl], [uploadedThumb.publicUrl]);

    await dbUpdateJobStage(jobId, "finished", 100);
    await dbUpdateJobStatus(jobId, "done");

    await cleanupLocalJobArtifacts({
      extraPaths: cleanupPaths,
    });
  } catch (err) {
    console.error("[processQuoteReelJob] Error:", err);

    await dbUpdateJobStatus(jobId, "failed");
    await dbUpdateJobStage(jobId, "finished", 100);

    await cleanupLocalJobArtifacts({
      extraPaths: cleanupPaths,
    });

    throw err;
  }
}
