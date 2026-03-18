import { FastifyInstance } from "fastify";
import path from "path";
import { requireUser } from "@server/auth/requireUser";
import {
  dbGetJob,
  dbSetJobCaptionedResults,
  dbSetJobReviewReady,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@server/jobs/jobsDb";
import { type CaptionDraftClip, generateSubtitlesFromDrafts } from "@server/video/caption";
import { analyzeFaceCropsForClips, type EnergyFrame } from "@server/video/faceCrop";
import { extractAudioForWhisper } from "@server/video/audio";
import { analyzeAudioEnergyForClip } from "@server/video/audioEnergy";
import { renderShortsWithSubtitles } from "@server/video/render";
import { uploadLocalFileToStorage } from "@server/storage/upload";
import { cleanupLocalJobArtifacts } from "@server/storage/cleanup";

type TextOverlayPosition = "top" | "center" | "bottom";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
};

type SubtitleFile = string | { path: string };

function subtitleToPath(s: SubtitleFile): string {
  return typeof s === "string" ? s : s.path;
}

export async function registerJobRenderRoute(app: FastifyInstance) {
  app.post("/api/jobs/:jobId/render", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const jobId = String((req.params as any)?.jobId ?? "");
    if (!jobId) {
      return reply.code(400).send({ error: "Missing jobId" });
    }

    const job = await dbGetJob(jobId);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    if (job.owner_id !== user.id) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    if (job.job_goal !== "shorts") {
      return reply.code(400).send({
        error: "Render is available only for shorts jobs",
      });
    }

    if (!job.review_ready) {
      return reply.code(400).send({
        error: "Job is not ready for review render",
      });
    }

    const clips: string[] = Array.isArray(job.clips) ? job.clips : [];
    if (!clips.length) {
      return reply.code(400).send({ error: "This job has no prepared clips" });
    }

    const captionDrafts: CaptionDraftClip[] = Array.isArray(job.caption_drafts)
      ? job.caption_drafts
      : [];

    if (!captionDrafts.length) {
      return reply.code(400).send({
        error: "No caption drafts found for this job",
      });
    }

    const textOverlays: TextOverlay[] = Array.isArray(job.text_overlays) ? job.text_overlays : [];

    const captionsEnabled = job.captions_enabled ?? true;
    const style = job.caption_style ?? "karaoke";
    const aspect = job.aspect ?? "horizontal";

    const audioPaths: string[] = [];
    const extraPaths: string[] = [];
    const energyByClip: (EnergyFrame[] | null)[] = [];

    try {
      await dbUpdateJobStatus(jobId, "processing");
      await dbUpdateJobStage(jobId, "captioning", 55);

      // --- AUDIO ENERGY ANALYSIS ---
      for (const clipPath of clips) {
        try {
          const audioPath = await extractAudioForWhisper(clipPath);
          audioPaths.push(audioPath);

          const energyFrames = await analyzeAudioEnergyForClip(audioPath);
          energyByClip.push(energyFrames);
        } catch (err) {
          console.warn("[renderJob] Failed energy analysis for clip:", clipPath, err);
          energyByClip.push(null);
        }
      }

      // --- GENERATE SUBTITLES FROM EDITED DRAFTS ---
      const subtitleFiles = await generateSubtitlesFromDrafts(captionDrafts, clips, {
        captionStyle: style,
      });

      const subtitlePaths = subtitleFiles.map(subtitleToPath).filter(Boolean);

      // --- SMART CROP ---
      await dbUpdateJobStage(jobId, "clipping", 65);
      const smartCrops = await analyzeFaceCropsForClips(clips, energyByClip);

      // --- RENDER ---
      await dbUpdateJobStage(jobId, "rendering", 80);

      const { videos, thumbs } = await renderShortsWithSubtitles(clips, subtitleFiles, {
        aspect,
        style,
        captionsEnabled,
        smartCrop: smartCrops,
        textOverlays,
      });

      extraPaths.push(...videos, ...(thumbs ?? []).filter(Boolean));

      // --- UPLOAD ---
      await dbUpdateJobStage(jobId, "uploading", 92);

      const videoUrls: string[] = [];
      const thumbUrls: string[] = [];

      for (let i = 0; i < videos.length; i++) {
        const localVideoPath = videos[i];
        const localThumbPath = thumbs?.[i];

        const videoObjectPath = `jobs/${jobId}/short-${i + 1}.mp4`;
        const thumbExt = localThumbPath ? path.extname(localThumbPath) || ".jpg" : ".jpg";
        const thumbObjectPath = `jobs/${jobId}/thumb-${i + 1}${thumbExt}`;

        const uploadedVideo = await uploadLocalFileToStorage(localVideoPath, videoObjectPath);

        if (!uploadedVideo.publicUrl) {
          throw new Error("No publicUrl returned for uploaded video");
        }

        videoUrls.push(uploadedVideo.publicUrl);

        if (localThumbPath) {
          const uploadedThumb = await uploadLocalFileToStorage(localThumbPath, thumbObjectPath);
          thumbUrls.push(uploadedThumb.publicUrl);
        } else {
          thumbUrls.push("");
        }
      }

      // --- SAVE RESULTS ---
      await dbSetJobCaptionedResults(jobId, videoUrls, thumbUrls);
      await dbSetJobReviewReady(jobId, false);

      await dbUpdateJobStage(jobId, "finished", 100);
      await dbUpdateJobStatus(jobId, "done");

      // --- CLEANUP ---
      await cleanupLocalJobArtifacts({
        clipPaths: [],
        audioPaths,
        subtitlePaths,
        extraPaths,
      });

      const updated = await dbGetJob(jobId);

      return reply.code(200).send({
        ok: true,
        job: updated,
      });
    } catch (err) {
      console.error("[renderJob] Error:", err);

      await dbUpdateJobStatus(jobId, "failed");
      await dbUpdateJobStage(jobId, "finished", 100);

      await cleanupLocalJobArtifacts({
        clipPaths: [],
        audioPaths,
        subtitlePaths: [],
        extraPaths,
      });

      return reply.code(500).send({
        error: "Failed to render reviewed job",
      });
    }
  });
}
