import { FastifyInstance } from "fastify";
import { requireUser } from "@server/auth/requireUser";
import {
  dbGetJob,
  dbSetJobCaptionedResults,
  dbSetJobReviewReady,
  dbSetMultiSourceFinalVideoUrl,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@server/jobs/jobsDb";
import { renderMultiSourceFinalVideo } from "@server/video/renderMultiSource";
import { uploadLocalFileToStorage } from "@server/storage/upload";
import { cleanupLocalJobArtifacts } from "@server/storage/cleanup";
import { downloadPublicAssetToTemp } from "@server/video/publicAsset";

export async function registerMultiSourceEditRenderRoute(app: FastifyInstance) {
  app.post("/api/multi-source-edit/:jobId/render", async (req, reply) => {
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

    if (job.job_goal !== "multi_source_edit") {
      return reply.code(400).send({ error: "Render is available only for multi_source_edit jobs" });
    }

    if (!job.review_ready) {
      return reply.code(400).send({ error: "Job is not ready for final render" });
    }

    const config = job.multi_source_edit_config ?? {};
    const draftVideoUrl = config?.draftVideoUrl;
    const reviewConfig = config?.reviewConfig ?? {};

    if (!draftVideoUrl) {
      return reply.code(400).send({ error: "Draft video URL not found" });
    }

    const extraPaths: string[] = [];
    let localDraftPath = "";

    try {
      await dbUpdateJobStatus(jobId, "processing");
      await dbUpdateJobStage(jobId, "rendering", 80);

      localDraftPath = await downloadPublicAssetToTemp(draftVideoUrl);
      extraPaths.push(localDraftPath);

      const { finalVideoPath, cleanupPaths } = await renderMultiSourceFinalVideo({
        inputPath: localDraftPath,
        aspect: job.aspect ?? "horizontal",
        textOverlays: Array.isArray(reviewConfig.textOverlays) ? reviewConfig.textOverlays : [],
        blackWhiteRanges: Array.isArray(reviewConfig.blackWhiteRanges)
          ? reviewConfig.blackWhiteRanges
          : [],
        ending: reviewConfig.ending ?? null,
      });

      extraPaths.push(...cleanupPaths);

      await dbUpdateJobStage(jobId, "uploading", 92);

      const uploadedVideo = await uploadLocalFileToStorage(
        finalVideoPath,
        `jobs/${jobId}/multi-source-final.mp4`,
      );

      if (!uploadedVideo.publicUrl) {
        throw new Error("No publicUrl returned for uploaded final video");
      }

      await dbSetJobCaptionedResults(jobId, [uploadedVideo.publicUrl], []);
      await dbSetMultiSourceFinalVideoUrl(jobId, uploadedVideo.publicUrl);
      await dbSetJobReviewReady(jobId, false);

      await dbUpdateJobStage(jobId, "finished", 100);
      await dbUpdateJobStatus(jobId, "done");

      await cleanupLocalJobArtifacts({
        clipPaths: [],
        audioPaths: [],
        subtitlePaths: [],
        extraPaths,
      });

      const updated = await dbGetJob(jobId);

      return reply.code(200).send({
        ok: true,
        job: updated,
      });
    } catch (error) {
      console.error("[multiSourceEditRender] Error:", error);

      await dbUpdateJobStatus(jobId, "failed");
      await dbUpdateJobStage(jobId, "finished", 100);

      await cleanupLocalJobArtifacts({
        clipPaths: [],
        audioPaths: [],
        subtitlePaths: [],
        extraPaths,
      });

      return reply.code(500).send({ error: "Failed to render multi-source final video" });
    }
  });
}
