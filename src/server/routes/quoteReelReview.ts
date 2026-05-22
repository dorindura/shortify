import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { requireUser } from "@server/auth/requireUser";
import {
  dbGetJob,
  dbUpdateJob,
  dbUpdateJobQuoteMeta,
} from "@server/jobs/jobsDb";
import { jobsQueue } from "@server/jobs/queue";
import type { QuoteReelMeta } from "@lib/jobsStore";

function normalizeScript(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function registerQuoteReelReviewRoute(app: FastifyInstance) {
  app.post("/api/quote-reel/:jobId/script", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const { jobId: rawJobId } = req.params as { jobId?: string };
    const jobId = String(rawJobId ?? "");
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

    if (job.job_goal !== "quote_reel") {
      return reply.code(400).send({ error: "Script review is available only for quote reels" });
    }

    const currentMeta = (job.quote_reel_meta ?? {}) as QuoteReelMeta;
    const hasReviewableScript = normalizeScript(currentMeta.finalScript).length >= 20;
    const isScriptReviewReady = job.review_ready && job.stage === "review_ready";
    const isRecoverableQueuedRender =
      job.status === "pending" &&
      job.stage === "queued" &&
      hasReviewableScript;

    if (!isScriptReviewReady && !isRecoverableQueuedRender) {
      return reply.code(400).send({ error: "Quote reel is not ready for script review" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const finalScript = normalizeScript(body.finalScript);
    const continueRender = body.continueRender === true;

    if (finalScript.length < 20) {
      return reply.code(400).send({ error: "Script is too short" });
    }

    if (finalScript.length > 12000) {
      return reply.code(400).send({ error: "Script is too long" });
    }

    const previousScript = normalizeScript(currentMeta.finalScript);
    const nextMeta: QuoteReelMeta = {
      ...currentMeta,
      finalScript,
      originalFinalScript: currentMeta.originalFinalScript ?? previousScript ?? finalScript,
      scriptReviewRequired: true,
      scriptReviewApproved: continueRender,
      scriptEdited: finalScript !== previousScript || currentMeta.scriptEdited === true,
      voiceover: {
        ...(currentMeta.voiceover ?? {}),
        enabled: currentMeta.voiceover?.enabled ?? currentMeta.voiceEnabled ?? true,
        audioPath: undefined,
        audioUrl: undefined,
        durationSec: undefined,
        captionDraft: undefined,
      },
      selectedAssets: [],
    };

    await dbUpdateJobQuoteMeta(jobId, nextMeta);

    if (!continueRender) {
      await dbUpdateJob(jobId, {
        status: "done",
        stage: "review_ready",
        progress: 100,
        review_ready: true,
        caption_drafts: [],
        captioned_clips: [],
        captioned_thumbs: [],
      });
      const updated = await dbGetJob(jobId);
      return reply.code(200).send({ ok: true, job: updated });
    }

    await jobsQueue.add("process", { jobId }, {
      jobId: `${jobId}-quote-reel-render-${randomUUID()}`,
    });

    await dbUpdateJob(jobId, {
      status: "pending",
      stage: "script_generation",
      progress: 18,
      review_ready: false,
      caption_drafts: [],
      captioned_clips: [],
      captioned_thumbs: [],
    });

    const updated = await dbGetJob(jobId);
    return reply.code(200).send({ ok: true, job: updated });
  });
}
