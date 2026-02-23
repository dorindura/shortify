import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth/requireUser";
import { listJobsByOwner } from "@lib/jobsRepo";
import { supabaseAdmin } from "../supabaseAdmin";
import { hasProAccess } from "@server/billing/hasProAccess";

const BUCKET = "shorts";

export async function isAdminUser(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return false;
  return data?.role === "admin";
}

async function removeFolderRecursive(
  supabase: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  prefix: string,
) {
  const pathsToRemove: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      if (item?.name) pathsToRemove.push(`${prefix}${item.name}`);
    }

    if (data.length < limit) break;
    offset += limit;
  }

  if (pathsToRemove.length === 0) return { removed: 0 };

  const { error: removeErr } = await supabase.storage.from(bucket).remove(pathsToRemove);
  if (removeErr) throw removeErr;

  return { removed: pathsToRemove.length };
}

export async function registerJobsRoute(app: FastifyInstance) {
  app.get("/api/jobs", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    try {
      const sb = supabaseAdmin();

      const jobs = await listJobsByOwner(user.id, sb);

      const isPro = await hasProAccess(user.id);
      const isAdmin = await isAdminUser(user.id);

      return reply.send({
        jobs,
        canDelete: isAdmin || isPro,
      });
    } catch (e) {
      app.log.error({ err: e }, "Failed to list jobs");
      return reply.code(500).send({ error: "Failed to list jobs" });
    }
  });

  app.delete("/api/jobs/:id", async (req: any, reply: any) => {
    const jobId = req.params.id as string;

    const user = await requireUser(req, reply);
    if (!user) return;

    const supabase = supabaseAdmin();

    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, owner_id, deleted_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !job) return reply.code(404).send({ error: "Job not found" });

    const isAdmin = await isAdminUser(user.id);

    if (!isAdmin) {
      if (job.owner_id !== user.id) return reply.code(403).send({ error: "Forbidden" });

      const isPro = await hasProAccess(user.id);
      if (!isPro) return reply.code(403).send({ error: "Free plan cannot delete jobs" });
    }

    const folderPrefix = `jobs/${jobId}/`;
    try {
      const result = await removeFolderRecursive(supabase, BUCKET, folderPrefix);
      req.log?.info({ jobId, bucket: BUCKET, folderPrefix, ...result }, "Deleted storage objects");
    } catch (err) {
      req.log?.error(
        { err, jobId, bucket: BUCKET, folderPrefix },
        "Failed to remove storage folder contents",
      );
      return reply.code(500).send({ error: "Failed to remove job files" });
    }

    const { error: delAssetsErr } = await supabase.from("job_assets").delete().eq("job_id", jobId);
    if (delAssetsErr) {
      req.log?.error({ delAssetsErr, jobId }, "Failed to delete job_assets rows");
      return reply.code(500).send({ error: "Failed to delete job assets rows" });
    }

    const { error: delJobErr } = await supabase.from("jobs").delete().eq("id", jobId);
    if (delJobErr) {
      req.log?.error({ delJobErr, jobId }, "Failed to delete job row");
      return reply.code(500).send({ error: "Failed to delete job" });
    }

    return reply.send({ ok: true });
  });
}
