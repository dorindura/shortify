// src/app/api/upload/route.ts
import { FastifyInstance } from "fastify";
import type {
  CaptionStyle,
  Job,
  JobAspect,
  ShortsCustomClip,
  ShortsCustomRange,
} from "@lib/jobsStore";
import { hasVideoExtension } from "../../utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { createJob } from "@lib/jobsRepo";
import { requireUser } from "@server/auth/requireUser";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import path from "path";
import { supabaseAdmin } from "@server/supabaseAdmin";
import { pipeline } from "stream/promises";
import { UPLOAD_MAX_FILE_BYTES, formatBytes } from "@server/uploadLimits";

type MultipartField = { value?: unknown };

export async function registerUploadRoute(app: FastifyInstance) {
  app.post("/api/upload", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const mp = await req.file();
    if (!mp) return reply.code(400).send({ error: "No file provided" });

    if (!hasVideoExtension(mp.filename)) {
      return reply.code(400).send({
        error: "File is not a supported video type",
      });
    }

    // Read extra fields from multipart
    const fields = mp.fields as Record<string, MultipartField | undefined>;
    const aspectField = String(fields?.aspect?.value ?? "horizontal");
    const aspect: JobAspect =
      aspectField === "horizontal" ||
      aspectField === "vertical" ||
      aspectField === "verticalLetterbox" ||
      aspectField === "verticalFit"
        ? aspectField
        : "horizontal";

    const jobGoalField = String(fields?.jobGoal?.value ?? "shorts");
    const jobGoal = jobGoalField === "summary" ? "summary" : "shorts";
    const outputModeRaw = String(fields?.outputMode?.value ?? "shorts");
    const isLocalOutputMode = outputModeRaw === "full_x2_local";

    if (isLocalOutputMode && process.env.NODE_ENV === "production") {
      return reply.code(403).send({ error: "Local-only output mode is disabled in production" });
    }

    const outputMode = isLocalOutputMode ? "full_x2_local" : "shorts";

    const summaryTargetSecRaw = Number(fields?.summaryTargetSec?.value ?? 90);
    const summaryTargetSec = Number.isFinite(summaryTargetSecRaw)
      ? Math.max(30, Math.min(300, summaryTargetSecRaw))
      : 90;

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
      captionStyleField === "karaoke" ||
      captionStyleField === "wordByWord" ||
      captionStyleField === "progressiveWords"
        ? captionStyleField
        : "karaoke";

    const selectionMode =
      String(fields?.selectionMode?.value ?? "auto") === "custom" ? "custom" : "auto";

    let customRanges: (ShortsCustomRange | ShortsCustomClip)[] = [];

    try {
      const parsed = JSON.parse(String(fields?.customRanges?.value ?? "[]")) as unknown;
      customRanges = Array.isArray(parsed)
        ? (parsed as (ShortsCustomRange | ShortsCustomClip)[])
        : [];
    } catch {
      customRanges = [];
    }

    const customClipCount =
      selectionMode === "custom"
        ? customRanges.filter((item: unknown) => {
            const clip = (item ?? {}) as { ranges?: unknown; startSec?: unknown };
            return Array.isArray(clip.ranges) ? clip.ranges.length > 0 : clip.startSec != null;
          }).length
        : 0;

    const requestedMaxClips = customClipCount > 0 ? customClipCount : maxClips;

    const limit = await enforceJobLimits(user.id, {
      clipDurationSec,
      maxClips: requestedMaxClips,
      aspect,
      jobGoal,
      summaryTargetSec,
    });
    if (!limit.ok) {
      return reply.code(402).send({
        error: limit.reason,
        upgradeRequired: true,
      });
    }

    // Fly: use /tmp (ephemeral)
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = mp.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadsDir, fileName);

    try {
      await pipeline(mp.file, createWriteStream(filePath));
    } catch (error: unknown) {
      await fs.unlink(filePath).catch(() => {});
      const uploadError = error as { code?: string };

      if (uploadError?.code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({
          error: `Uploaded file is too large. Maximum upload size is ${formatBytes(
            UPLOAD_MAX_FILE_BYTES,
          )}.`,
        });
      }

      throw error;
    }

    if (mp.file.truncated) {
      await fs.unlink(filePath).catch(() => {});
      return reply.code(413).send({
        error: `Uploaded file is too large. Maximum upload size is ${formatBytes(
          UPLOAD_MAX_FILE_BYTES,
        )}.`,
      });
    }

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
      maxClips: requestedMaxClips,
      captionsEnabled,
      captionStyle,
      jobGoal,
      summaryTargetSec: jobGoal === "summary" ? summaryTargetSec : undefined,
      clips: [],
      captionedClips: [],
      captionedThumbs: [],
      stage: "queued",
      progress: 0,
      shortsConfig: {
        selectionMode,
        outputMode: jobGoal === "shorts" ? outputMode : "shorts",
        customRanges,
      },
    };

    await createJob(job, supabaseAdmin());
    enqueueJob(job).catch(console.error);

    return reply.code(201).send({ job });
  });
}
