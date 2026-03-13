import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";

import type { CaptionStyle, Job } from "@lib/jobsStore";
import { createJob } from "@lib/jobsRepo";
import { enqueueJob } from "@server/jobs/queue";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { requireUser } from "@server/auth/requireUser";
import { supabaseAdmin } from "@server/supabaseAdmin";

type QuoteTone = "aggressive" | "cinematic" | "calm" | "dark";

export async function registerQuoteReelRoute(app: FastifyInstance) {
  app.post("/api/quote-reel", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as any;

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return reply.code(400).send({ error: "Missing prompt" });
    }

    const rawTone = body.tone as QuoteTone | undefined;
    const tone: QuoteTone =
      rawTone === "aggressive" ||
      rawTone === "cinematic" ||
      rawTone === "calm" ||
      rawTone === "dark"
        ? rawTone
        : "cinematic";

    const durationSecRaw = Number(body.durationSec ?? 30);
    const durationSec = Number.isFinite(durationSecRaw)
      ? Math.max(15, Math.min(60, durationSecRaw))
      : 30;

    const overlayHandle = typeof body.overlayHandle === "string" ? body.overlayHandle.trim() : "";

    const captionsEnabled = typeof body.captionsEnabled === "boolean" ? body.captionsEnabled : true;

    const rawStyle = body.captionStyle as CaptionStyle | undefined;
    const captionStyle: CaptionStyle =
      rawStyle === "boldYellow" || rawStyle === "subtle" || rawStyle === "karaoke"
        ? rawStyle
        : "karaoke";

    const limit = await enforceJobLimits(user.id, {
      clipDurationSec: durationSec,
      maxClips: 1,
      aspect: "vertical",
      jobGoal: "quote_reel",
      summaryTargetSec: durationSec,
    });

    if (!limit.ok) {
      return reply.code(402).send({
        error: limit.reason,
        upgradeRequired: true,
      });
    }

    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      ownerId: user.id,
      type: "quote_reel",
      source: `quote:${prompt}`,
      status: "pending",
      createdAt: now,
      updatedAt: now,

      aspect: "vertical",
      captionsEnabled,
      captionStyle,

      jobGoal: "quote_reel",
      clips: [],
      captionedClips: [],
      captionedThumbs: [],
      stage: "queued",
      progress: 0,

      quotePrompt: prompt,
      quoteReelMeta: {
        tone,
        durationSec,
        overlayHandle,
      },
    };

    await createJob(job, supabaseAdmin());
    enqueueJob(job).catch(console.error);

    return reply.code(201).send({ job });
  });
}
