import {
  dbGetJob,
  dbSetJobReviewReady,
  dbSetMultiSourceDraftVideoUrl,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@/server/jobs/jobsDb";
import { downloadVideoFromUrl } from "@server/video/download";
import { uploadLocalFileToStorage } from "@/server/storage/upload";
import {
  concatPreparedSegments,
  createMultiSourceJobWorkspace,
  cutSingleSegment,
  normalizeSegmentForConcat,
  removeMultiSourceJobWorkspace,
} from "@server/video/multiSource";
import type { JobAspect, MultiSourceSegment } from "@lib/jobsStore";
import { cleanupLocalJobArtifacts } from "@/server/storage/cleanup";

type DownloadedSourceMap = Map<string, string>;

function groupUniqueUrls(segments: MultiSourceSegment[]): string[] {
  return [...new Set(segments.map((s) => s.url.trim()).filter(Boolean))];
}

function validateSegments(rawSegments: any[]): MultiSourceSegment[] {
  return rawSegments
    .map((segment) => ({
      id: String(segment?.id ?? ""),
      sourceId: String(segment?.sourceId ?? ""),
      url: String(segment?.url ?? "").trim(),
      startSec: Number(segment?.startSec ?? 0),
      endSec: Number(segment?.endSec ?? 0),
      order: Number(segment?.order ?? 0),
    }))
    .filter(
      (segment) =>
        segment.id &&
        segment.sourceId &&
        segment.url &&
        Number.isFinite(segment.startSec) &&
        Number.isFinite(segment.endSec) &&
        segment.endSec > segment.startSec &&
        segment.order >= 0,
    )
    .sort((a, b) => a.order - b.order);
}

export async function processMultiSourceEditJob(jobId: string) {
  const job = await dbGetJob(jobId);
  if (!job) {
    throw new Error(`Multi-source job not found: ${jobId}`);
  }

  if (job.job_goal !== "multi_source_edit") {
    throw new Error(`Job ${jobId} is not multi_source_edit`);
  }

  const config = job.multi_source_edit_config ?? {};
  const segments = validateSegments(Array.isArray(config?.segments) ? config.segments : []);
  const aspect = (job.aspect ?? "horizontal") as JobAspect;

  if (!segments.length) {
    throw new Error("No valid segments found in multi_source_edit_config");
  }

  const workspace = await createMultiSourceJobWorkspace(jobId);
  const downloadedSources: DownloadedSourceMap = new Map();

  try {
    await dbUpdateJobStatus(jobId, "processing");
    await dbUpdateJobStage(jobId, "downloading", 10);

    const uniqueUrls = groupUniqueUrls(segments);

    if (uniqueUrls.length > 5) {
      throw new Error("A maximum of 5 unique source URLs is allowed");
    }

    for (let i = 0; i < uniqueUrls.length; i++) {
      const url = uniqueUrls[i];
      const localPath = await downloadVideoFromUrl(url);
      downloadedSources.set(url, localPath);

      const progress = Math.min(30, 10 + Math.round(((i + 1) / uniqueUrls.length) * 20));
      await dbUpdateJobStage(jobId, "downloading", progress);
    }

    await dbUpdateJobStage(jobId, "clipping", 35);

    const normalizedSegmentPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const sourcePath = downloadedSources.get(segment.url);

      if (!sourcePath) {
        throw new Error(`Downloaded source not found for URL: ${segment.url}`);
      }

      const cutPath = await cutSingleSegment({
        inputPath: sourcePath,
        startSec: segment.startSec,
        endSec: segment.endSec,
        outputDir: workspace.cutsDir,
      });

      const normalizedPath = await normalizeSegmentForConcat({
        inputPath: cutPath,
        aspect,
        outputDir: workspace.normalizedDir,
      });

      normalizedSegmentPaths.push(normalizedPath);

      const progress = Math.min(70, 35 + Math.round(((i + 1) / segments.length) * 35));
      await dbUpdateJobStage(jobId, "clipping", progress);
    }

    await dbUpdateJobStage(jobId, "assembling", 75);

    const draftPath = await concatPreparedSegments({
      inputPaths: normalizedSegmentPaths,
      outputDir: workspace.outputDir,
    });

    await dbUpdateJobStage(jobId, "uploading", 88);

    const uploadedDraft = await uploadLocalFileToStorage(
      draftPath,
      `jobs/${jobId}/multi-source-draft.mp4`,
    );

    if (!uploadedDraft.publicUrl) {
      throw new Error("Draft upload succeeded but no publicUrl was returned");
    }

    await dbSetMultiSourceDraftVideoUrl(jobId, uploadedDraft.publicUrl);
    await dbSetJobReviewReady(jobId, true);
    await dbUpdateJobStage(jobId, "review_ready", 100);
    await dbUpdateJobStatus(jobId, "done");
  } catch (error) {
    console.error("[processMultiSourceEditJob] Error:", error);
    await dbUpdateJobStatus(jobId, "failed");
    await dbUpdateJobStage(jobId, "finished", 100);
    throw error;
  } finally {
    await cleanupLocalJobArtifacts({
      extraPaths: [...downloadedSources.values()],
    });

    await removeMultiSourceJobWorkspace(jobId);
  }
}
