// src/app/api/upload/route.ts
import { FastifyInstance } from "fastify";
import type { CaptionStyle, Job, JobAspect } from "@lib/jobsStore";
import { hasVideoExtension } from "../../utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { createJob } from "@lib/jobsRepo";
import { requireUser } from "@server/auth/requireUser";
import { promises as fs } from "fs";
import path from "path";
import { supabaseAdmin } from "@server/supabaseAdmin";

export async function registerUploadRoute(app: FastifyInstance) {
  app.post("/api/upload", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const mp = await req.file();
    if (!mp) return reply.code(400).send({ error: "No file provided" });

    if (!hasVideoExtension(mp.filename)) {
      return reply.code(400).send({ error: "File is not a supported video type" });
    }

    // Read extra fields from multipart
    const fields = mp.fields as Record<string, any>;
    const aspectField = String(fields?.aspect?.value ?? "horizontal");
    const aspect: JobAspect =
      aspectField === "horizontal" ||
      aspectField === "vertical" ||
      aspectField === "verticalLetterbox"
        ? aspectField
        : "horizontal";

    const clipDurationSecRaw = Number(fields?.clipDurationSec?.value ?? 30);
    const clipDurationSec =
      Number.isFinite(clipDurationSecRaw) && clipDurationSecRaw > 0 ? clipDurationSecRaw : 30;

    const maxClipsRaw = Number(fields?.maxClips?.value ?? 3);
    const maxClips = Number.isFinite(maxClipsRaw) && maxClipsRaw > 0 ? maxClipsRaw : 3;

    const captionsEnabledRaw = String(fields?.captionsEnabled?.value ?? "true");
    const captionsEnabled = captionsEnabledRaw === "true";

    const captionStyleField = String(fields?.captionStyle?.value ?? "karaoke");
    const captionStyle: CaptionStyle =
      captionStyleField === "boldYellow" ||
      captionStyleField === "subtle" ||
      captionStyleField === "karaoke"
        ? captionStyleField
        : "karaoke";

    const limit = await enforceJobLimits(user.id, { clipDurationSec, maxClips, aspect });
    if (!limit.ok) {
      return reply.code(402).send({ error: limit.reason, upgradeRequired: true });
    }

    // Fly: use /tmp (ephemeral)
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = mp.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, await mp.toBuffer());

    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      ownerId: user.id,
      type: "upload",
      source: filePath,
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
