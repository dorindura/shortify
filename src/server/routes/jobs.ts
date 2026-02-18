import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth/requireUser";
import { listJobsByOwner } from "@lib/jobsRepo";
import { supabaseAdmin } from "../supabaseAdmin";
import { requireAdmin } from "@server/auth/requireAdmin";
import { hasProAccess } from "@server/billing/hasProAccess";

const BUCKET = "shorts";

export async function isAdminUser(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return false;
  return data?.role === "admin";
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
      .select("id,owner_id,deleted_at")
      .eq("id", jobId)
      .single();

    if (error || !job) return reply.code(404).send({ error: "Job not found" });
    if (job.deleted_at) return reply.send({ ok: true });

    const isAdmin = !!(await requireAdmin(req, {
      ...reply,
      send: () => null,
      code: () => reply,
    } as any));

    if (!isAdmin) {
      if (job.owner_id !== user.id) return reply.code(403).send({ error: "Forbidden" });

      const isPro = await hasProAccess(user.id);
      if (!isPro) return reply.code(403).send({ error: "Free plan cannot delete jobs" });
    }

    const { data: assets } = await supabase
      .from("job_assets")
      .select("bucket,object_path")
      .eq("job_id", jobId);

    const paths = (assets ?? [])
      .filter((a) => a.bucket === BUCKET && a.object_path)
      .map((a) => a.object_path);

    if (paths.length) {
      await supabase.storage.from(BUCKET).remove(paths);
    }

    await supabase
      .from("jobs")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId);

    return reply.send({ ok: true });
  });
}
