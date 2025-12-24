import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth/requireUser";
import { listJobsByOwner } from "@lib/jobsRepo";
import { supabaseAdmin } from "../supabaseAdmin";

export async function registerJobsRoute(app: FastifyInstance) {
    app.get("/api/jobs", async (req, reply) => {
        const user = await requireUser(req, reply);
        if (!user) return;

        try {
            const jobs = await listJobsByOwner(user.id, supabaseAdmin);
            return reply.send({ jobs });
        } catch (e) {
            app.log.error({ err: e }, "Failed to list jobs");
            return reply.code(500).send({ error: "Failed to list jobs" });
        }
    });
}
