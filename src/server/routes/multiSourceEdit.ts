import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { requireUser } from "@server/auth/requireUser";
import { enqueueJob } from "@server/jobs/queue";
import { createJob } from "@lib/jobsRepo";
import { supabaseAdmin } from "@server/supabaseAdmin";
import type { Job, JobAspect, MultiSourceSegment } from "@lib/jobsStore";

function isValidAspect(value: unknown): value is JobAspect {
  return value === "horizontal" || value === "vertical" || value === "verticalLetterbox";
}

function sanitizeSegments(input: unknown): MultiSourceSegment[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((segment: any) => ({
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
        segment.endSec - segment.startSec >= 0.6 &&
        Number.isFinite(segment.order),
    )
    .sort((a, b) => a.order - b.order);
}

export async function registerMultiSourceEditRoute(app: FastifyInstance) {
  app.post("/api/multi-source-edit", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as any;

    const rawAspect = body.aspect;
    const aspect: JobAspect = isValidAspect(rawAspect) ? rawAspect : "horizontal";

    const segments = sanitizeSegments(body.segments);
    if (!segments.length) {
      return reply.code(400).send({ error: "At least one valid segment is required" });
    }

    const uniqueUrls = new Set(segments.map((s) => s.url.trim()).filter(Boolean));
    if (uniqueUrls.size > 5) {
      return reply.code(400).send({ error: "A maximum of 5 unique source URLs is allowed" });
    }

    const totalDurationSec = segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
    if (totalDurationSec > 60 * 30) {
      return reply.code(400).send({ error: "Total selected duration exceeds 30 minutes" });
    }

    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      ownerId: user.id,
      type: "multi_source_edit",
      source: "multi_source_edit",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      aspect,
      jobGoal: "multi_source_edit",
      stage: "queued",
      progress: 0,
      clips: [],
      captionedClips: [],
      captionedThumbs: [],
      reviewReady: false,
      multiSourceEditConfig: {
        segments,
        reviewConfig: {
          textOverlays: [],
          blackWhiteRanges: [],
          ending: null,
        },
      },
    };

    await createJob(job, supabaseAdmin());
    await enqueueJob(job);

    return reply.code(201).send({ job });
  });
}
