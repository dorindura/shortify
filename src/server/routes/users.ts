// src/server/routes/admin.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "../auth/requireAdmin";

export function registerAdminRoutes(app: any) {
    app.get("/admin/users", async (req: any, reply: any) => {
        const admin = await requireAdmin(req, reply);
        if (!admin) return;

        const supabase = supabaseAdmin();

        const { data: profiles, error: pErr } = await supabase
            .from("profiles")
            .select("id,email,role,created_at")
            .order("created_at", { ascending: false });

        if (pErr) return reply.code(500).send({ error: pErr.message });

        const userIds = (profiles ?? []).map(p => p.id);

        const { data: jobsAgg } = await supabase
            .from("jobs")
            .select("owner_id")
            .in("owner_id", userIds)
            .is("deleted_at", null);

        const { data: assets } = await supabase
            .from("job_assets")
            .select("user_id,bytes")
            .in("user_id", userIds);

        const { data: subs } = await supabase
            .from("stripe_subscriptions")
            .select("user_id,status,current_period_end")
            .in("user_id", userIds);

        const jobsCount = new Map<string, number>();
        for (const j of jobsAgg ?? []) jobsCount.set(j.owner_id, (jobsCount.get(j.owner_id) ?? 0) + 1);

        const storageBytes = new Map<string, number>();
        for (const a of assets ?? []) storageBytes.set(a.user_id, (storageBytes.get(a.user_id) ?? 0) + (a.bytes ?? 0));

        const subMap = new Map<string, any>();
        for (const s of subs ?? []) subMap.set(s.user_id, s);

        const out = (profiles ?? []).map(p => ({
            id: p.id,
            email: p.email,
            role: p.role,
            jobsCount: jobsCount.get(p.id) ?? 0,
            storageBytes: storageBytes.get(p.id) ?? 0,
            subscription: subMap.get(p.id) ?? null,
        }));

        return reply.send({ users: out });
    });
}
