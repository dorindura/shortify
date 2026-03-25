import fs from "fs";
import path from "path";
import { FastifyInstance } from "fastify";
import { requireUser } from "@server/auth/requireUser";
import { dbGetJob } from "@server/jobs/jobsDb";

export async function registerJobClipPreviewRoute(app: FastifyInstance) {
  app.get("/api/jobs/:jobId/clips/:clipIndex/preview", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const jobId = String((req.params as any)?.jobId ?? "");
    const clipIndex = Number((req.params as any)?.clipIndex ?? -1);

    if (!jobId || !Number.isInteger(clipIndex) || clipIndex < 0) {
      return reply.code(400).send({ error: "Invalid jobId or clipIndex" });
    }

    const job = await dbGetJob(jobId);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    if (job.owner_id !== user.id) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const previewClips: string[] = Array.isArray(job.preview_clips) ? job.preview_clips : [];
    const clipPath = previewClips[clipIndex];

    if (!clipPath) {
      return reply.code(404).send({ error: "Preview clip not found" });
    }

    const resolvedPath = path.resolve(clipPath);

    if (!fs.existsSync(resolvedPath)) {
      return reply.code(404).send({ error: "Preview clip file missing" });
    }

    reply.header("Content-Type", "video/mp4");
    reply.header("Accept-Ranges", "bytes");

    return reply.send(fs.createReadStream(resolvedPath));
  });
}
