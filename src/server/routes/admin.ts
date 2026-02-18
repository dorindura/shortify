import type { FastifyInstance } from "fastify";
import { requireAdmin } from "@server/auth/requireAdmin";
import { supabaseAdmin } from "@server/supabaseAdmin";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/overview", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const sb = supabaseAdmin();

    const { count: usersCount, error: usersErr } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (usersErr) return reply.code(500).send({ error: usersErr.message });

    const { data: jobs, error: jobsErr } = await sb.from("jobs").select("status");

    if (jobsErr) return reply.code(500).send({ error: jobsErr.message });

    const byStatus = (jobs ?? []).reduce<Record<string, number>>((acc, j: any) => {
      const s = j.status ?? "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    return reply.send({
      users: usersCount ?? 0,
      jobsTotal: jobs?.length ?? 0,
      jobsByStatus: byStatus,
    });
  });

  app.get("/api/admin/jobs", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const { status, ownerId, q, limit = 50, offset = 0 } = req.query as any;

    const sb = supabaseAdmin();

    let query = sb
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq("status", status);
    if (ownerId) query = query.eq("owner_id", ownerId);
    if (q) query = query.ilike("source", `%${q}%`);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({ jobs: data ?? [] });
  });

  app.delete("/api/admin/jobs/:id", async (req: any, reply: any) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const jobId = req.params.id as string;
    const sb = supabaseAdmin();

    const { error } = await sb
      .from("jobs")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({ ok: true });
  });

  app.get("/api/admin/users", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const sb = supabaseAdmin();
    
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select("id,role,created_at")
      .order("created_at", { ascending: false });

    if (pErr) return reply.code(500).send({ error: pErr.message });

    const { data: authRes, error: aErr } = await sb.auth.admin.listUsers({
      perPage: 1000,
    });

    if (aErr) return reply.code(500).send({ error: aErr.message });

    const emailById = new Map(authRes.users.map((u) => [u.id, u.email ?? null]));

    const users = (profiles ?? []).map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      role: p.role,
      created_at: p.created_at,
    }));

    return reply.send({ users });
  });

  app.patch("/api/admin/users/:id/role", async (req: any, reply: any) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const userId = req.params.id as string;
    const { role } = (req.body ?? {}) as any;

    if (!["user", "admin"].includes(role)) {
      return reply.code(400).send({ error: "Invalid role" });
    }

    const sb = supabaseAdmin();
    const { error } = await sb.from("profiles").update({ role }).eq("id", userId);

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({ ok: true });
  });
}
