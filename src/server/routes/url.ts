// src/app/api/url/route.ts
import { FastifyInstance } from "fastify";
import type { CaptionStyle, Job, JobAspect } from "@lib/jobsStore";
import { isValidUrl } from "../../utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";
import { createJob } from "@lib/jobsRepo";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { requireUser } from "@server/auth/requireUser";
import { supabaseAdmin } from "@server/supabaseAdmin";

export async function registerUrlRoute(app: FastifyInstance) {
  app.post("/api/url", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as any;

    if (!body || typeof body.url !== "string") {
      return reply.code(400).send({ error: "Missing url" });
    }

    const url = body.url.trim();
    if (!isValidUrl(url)) {
      return reply.code(400).send({ error: "Invalid url" });
    }

    const rawAspect = body.aspect as JobAspect | undefined;
    const aspect: JobAspect =
      rawAspect === "vertical" || rawAspect === "horizontal" || rawAspect === "verticalLetterbox"
        ? rawAspect
        : "horizontal";

    const clipDurationSec =
      typeof body.clipDurationSec === "number" && body.clipDurationSec > 0
        ? body.clipDurationSec
        : 30;

    const maxClips = typeof body.maxClips === "number" && body.maxClips > 0 ? body.maxClips : 3;

    const captionsEnabled = typeof body.captionsEnabled === "boolean" ? body.captionsEnabled : true;

    const rawStyle = body.captionStyle as CaptionStyle | undefined;
    const captionStyle: CaptionStyle =
      rawStyle === "boldYellow" || rawStyle === "subtle" || rawStyle === "karaoke"
        ? rawStyle
        : "karaoke";

    const limit = await enforceJobLimits(user.id, { clipDurationSec, maxClips, aspect });
    if (!limit.ok) {
      return reply.code(402).send({ error: limit.reason, upgradeRequired: true });
    }

    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      ownerId: user.id,
      type: "url",
      source: url,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      aspect,
      clipDurationSec,
      maxClips,
      captionsEnabled,
      captionStyle,
      clips: [],
      captionedClips: [],
      captionedThumbs: [],
      stage: "queued",
      progress: 0,
    };

    await createJob(job, supabaseAdmin());
    enqueueJob(job).catch(console.error);

    return reply.code(201).send({ job });
  });
}
